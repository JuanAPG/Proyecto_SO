/* ============================================================
   OSim — Servidor Node.js
   Arquitectura Cliente-Servidor con gestión de eventos.

   Características:
     · HTTP server: sirve los archivos estáticos del proyecto
     · EventEmitter: gestiona eventos internos del simulador
     · SSE (Server-Sent Events): transmite eventos en tiempo
       real a todos los clientes conectados
     · Headers COOP/COEP: habilita SharedArrayBuffer en el
       navegador (necesario para Workers con memoria compartida)
     · API REST mínima: /api/sim/start  /api/sim/done
     · Simulación de forks: cada simulación genera un PID
       de proceso virtualizado con su ciclo de vida completo

   Uso:
     node server.js
     Abrir http://localhost:3000
   ============================================================ */

"use strict";

const http            = require("http");
const fs              = require("fs");
const path            = require("path");
const { EventEmitter} = require("events");

/* ──────────────────────────────────────────────────────────
   CONFIGURACIÓN
────────────────────────────────────────────────────────── */
const PORT       = 3000;
const STATIC_DIR = __dirname;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".txt":  "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico":  "image/x-icon",
  ".png":  "image/png",
  ".svg":  "image/svg+xml",
};

/* ──────────────────────────────────────────────────────────
   GESTOR DE EVENTOS — EventEmitter del simulador
   Centraliza todos los eventos internos del sistema:
     simulation:fork   → se crea un proceso "hijo"
     simulation:start  → el fork inicia la simulación
     simulation:step   → avance en la simulación
     simulation:done   → el fork terminó y reporta métricas
     client:connect    → un navegador se conecta por SSE
     client:disconnect → el navegador se desconecta
────────────────────────────────────────────────────────── */
class SimulatorBus extends EventEmitter {}
const bus = new SimulatorBus();
bus.setMaxListeners(50);

/* ──────────────────────────────────────────────────────────
   ESTADO GLOBAL DEL SERVIDOR
────────────────────────────────────────────────────────── */
let forkCounter   = 0;          // PID autoincremental de forks
const activeForks = new Map();  // forkId → { algoritmo, inicio, ... }
const sseClients  = new Set();  // respuestas HTTP con keep-alive (SSE)

/* ──────────────────────────────────────────────────────────
   BROADCAST SSE — enviar a todos los clientes conectados
────────────────────────────────────────────────────────── */
function broadcast(evento, datos) {
  const payload = `event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch (_) {
      sseClients.delete(res);
    }
  }
}

/* ──────────────────────────────────────────────────────────
   MANEJADORES DE EVENTOS INTERNOS
────────────────────────────────────────────────────────── */
bus.on("simulation:fork", (info) => {
  activeForks.set(info.forkId, { ...info, estado: "running" });
  console.log(
    `[fork #${info.forkId}] Proceso creado — algoritmo: ${info.algoritmo}` +
    ` | refs: ${info.totalRefs} | marcos: ${info.marcos}`
  );
  broadcast("fork", info);
});

bus.on("simulation:done", (info) => {
  const fork = activeForks.get(info.forkId);
  if (fork) {
    fork.estado    = "done";
    fork.faults    = info.faults;
    fork.hits      = info.hits;
    fork.duracionMs = Date.now() - fork.timestamp;
    console.log(
      `[fork #${info.forkId}] Proceso terminado — ` +
      `fallos: ${info.faults} | hits: ${info.hits} | ` +
      `duración: ${fork.duracionMs} ms`
    );
  }
  broadcast("done", { ...info, duracionMs: fork ? fork.duracionMs : null });
});

bus.on("client:connect", () => {
  const total = sseClients.size;
  console.log(`[SSE] Cliente conectado — total clientes: ${total}`);
  broadcast("status", {
    clientes:     total,
    forksActivos: [...activeForks.values()].filter(f => f.estado === "running").length,
    timestamp:    Date.now(),
  });
});

bus.on("client:disconnect", () => {
  console.log(`[SSE] Cliente desconectado — total clientes: ${sseClients.size}`);
});

/* ──────────────────────────────────────────────────────────
   HEADERS COOP/COEP — habilitar SharedArrayBuffer
────────────────────────────────────────────────────────── */
function setCOOP(res) {
  res.setHeader("Cross-Origin-Opener-Policy",  "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

/* ──────────────────────────────────────────────────────────
   LEER BODY JSON
────────────────────────────────────────────────────────── */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => { raw += chunk; });
    req.on("end",  () => {
      try   { resolve(JSON.parse(raw)); }
      catch (_) { reject(new Error("JSON inválido")); }
    });
    req.on("error", reject);
  });
}

/* ──────────────────────────────────────────────────────────
   SERVIDOR HTTP
────────────────────────────────────────────────────────── */
const server = http.createServer(async (req, res) => {
  setCOOP(res);

  /* OPTIONS preflight (CORS) */
  if (req.method === "OPTIONS") {
    res.writeHead(204); res.end(); return;
  }

  /* ── GET /events — SSE endpoint ── */
  if (req.method === "GET" && req.url === "/events") {
    res.writeHead(200, {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
    });
    /* Tiempo de reconexión sugerido al cliente: 4 segundos */
    res.write(`retry: 4000\n\n`);
    sseClients.add(res);
    bus.emit("client:connect");

    req.on("close", () => {
      sseClients.delete(res);
      bus.emit("client:disconnect");
    });
    return;
  }

  /* ── POST /api/sim/start — notificar inicio de simulación ── */
  if (req.method === "POST" && req.url === "/api/sim/start") {
    try {
      const data   = await readBody(req);
      const forkId = ++forkCounter;
      const info   = { forkId, ...data, timestamp: Date.now() };
      bus.emit("simulation:fork", info);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, forkId }));
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  /* ── POST /api/sim/done — notificar fin de simulación ── */
  if (req.method === "POST" && req.url === "/api/sim/done") {
    try {
      const data = await readBody(req);
      bus.emit("simulation:done", data);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  /* ── GET /api/forks — estado de todos los forks ── */
  if (req.method === "GET" && req.url === "/api/forks") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      total:  forkCounter,
      forks:  [...activeForks.values()],
      clientes: sseClients.size,
    }));
    return;
  }

  /* ── Servir archivos estáticos ── */
  let urlPath = req.url.split("?")[0]; // ignorar query string
  if (urlPath === "/") urlPath = "/index.html";

  const filePath = path.join(STATIC_DIR, urlPath);

  /* Prevenir path traversal */
  if (!filePath.startsWith(STATIC_DIR)) {
    res.writeHead(403); res.end("Forbidden"); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 Not Found");
      return;
    }
    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime });
    res.end(data);
  });
});

/* ──────────────────────────────────────────────────────────
   INICIO
────────────────────────────────────────────────────────── */
server.listen(PORT, "0.0.0.0", () => {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║           OSim — Servidor iniciado           ║");
  console.log("╠══════════════════════════════════════════════╣");
  console.log(`║  URL:       http://localhost:${PORT}             ║`);
  console.log(`║  Eventos:   http://localhost:${PORT}/events       ║`);
  console.log(`║  API start: POST /api/sim/start               ║`);
  console.log(`║  API done:  POST /api/sim/done                ║`);
  console.log(`║  Forks:     GET  /api/forks                   ║`);
  console.log("║  SharedArrayBuffer: COOP/COEP activos ✓       ║");
  console.log("╚══════════════════════════════════════════════╝");
});

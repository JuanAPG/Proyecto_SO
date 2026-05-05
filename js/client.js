/* ============================================================
   OSim — Cliente del servidor de eventos
   Conecta al servidor Node.js vía SSE (Server-Sent Events)
   para recibir notificaciones de simulaciones en tiempo real.

   · Si el servidor no está corriendo, falla silenciosamente.
   · Expone window.OSimClient con métodos para notificar
     inicio y fin de simulaciones desde cualquier módulo.
   · Muestra un indicador de conexión en el navbar.
   ============================================================ */

(function () {
  "use strict";

  const SERVER_URL = "http://localhost:3000";
  let evtSource    = null;
  let _connected   = false;
  let _retryTimer  = null;
  let _activeForkId = null;

  /* ──────────────────────────────────────────────────────────
     CONEXIÓN SSE
  ────────────────────────────────────────────────────────── */
  function conectar() {
    if (evtSource) return; // ya hay una conexión activa

    try {
      evtSource = new EventSource(`${SERVER_URL}/events`);
    } catch (_) {
      // EventSource no disponible (ej. file://) — no hacer nada
      return;
    }

    /* ── Conexión exitosa ── */
    evtSource.onopen = () => {
      _connected = true;
      _clearRetry();
      _actualizarIndicador(true);
      console.info("[OSim Client] Conectado al servidor de eventos");
    };

    /* ── Evento: fork iniciado ── */
    evtSource.addEventListener("fork", (e) => {
      const data = _parseEvento(e.data);
      if (!data) return;
      console.info(`[OSim Client] Fork #${data.forkId} — ${data.algoritmo} (${data.totalRefs} refs, ${data.marcos} marcos)`);
      _toast(`Fork #${data.forkId} lanzado: ${data.algoritmo}`, "info");
    });

    /* ── Evento: fork completado ── */
    evtSource.addEventListener("done", (e) => {
      const data = _parseEvento(e.data);
      if (!data) return;
      const dur = data.duracionMs != null ? ` en ${data.duracionMs} ms` : "";
      console.info(`[OSim Client] Fork #${data.forkId} completado${dur} — fallos: ${data.faults}`);
      _toast(`Fork #${data.forkId} terminado: ${data.faults} fallos / ${data.hits} hits${dur}`, "success");
    });

    /* ── Evento: estado del servidor (cuántos clientes hay) ── */
    evtSource.addEventListener("status", (e) => {
      const data = _parseEvento(e.data);
      if (!data) return;
      _actualizarIndicador(true, data.clientes, data.forksActivos);
    });

    /* ── Error / reconexión ── */
    evtSource.onerror = () => {
      _connected = false;
      _actualizarIndicador(false);
      evtSource.close();
      evtSource = null;
      /* Reintentar cada 12 segundos sin bloquear */
      _retryTimer = setTimeout(conectar, 12000);
    };
  }

  /* ──────────────────────────────────────────────────────────
     API PÚBLICA — notificar al servidor desde los módulos
  ────────────────────────────────────────────────────────── */

  /**
   * Notificar al servidor que inicia una simulación.
   * El servidor emite un evento "fork" a todos los clientes.
   * @returns {Promise<number|null>} forkId o null si no hay servidor
   */
  function notificarInicio(algoritmo, totalRefs, marcos) {
    if (!_connected) return Promise.resolve(null);
    return fetch(`${SERVER_URL}/api/sim/start`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ algoritmo, totalRefs, marcos }),
    })
      .then(r => r.json())
      .then(d => { _activeForkId = d.forkId; return d.forkId; })
      .catch(() => null);
  }

  /**
   * Notificar al servidor que terminó la simulación actual.
   */
  function notificarFin(faults, hits) {
    if (!_connected || _activeForkId === null) return;
    fetch(`${SERVER_URL}/api/sim/done`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ forkId: _activeForkId, faults, hits }),
    }).catch(() => {});
    _activeForkId = null;
  }

  /* ──────────────────────────────────────────────────────────
     INDICADOR VISUAL EN NAVBAR
  ────────────────────────────────────────────────────────── */
  function _actualizarIndicador(online, clientes, forksActivos) {
    let wrap = document.getElementById("osim-srv-indicator");

    if (!wrap) {
      const nav = document.querySelector(".navbar");
      if (!nav) return;
      wrap = document.createElement("div");
      wrap.id = "osim-srv-indicator";
      wrap.style.cssText =
        "display:flex;align-items:center;gap:5px;margin-left:auto;" +
        "font-size:10px;color:#4A6A8A;font-family:var(--font-mono,monospace);" +
        "padding:0 12px;white-space:nowrap;";
      wrap.innerHTML =
        `<span id="osim-srv-dot" style="width:7px;height:7px;border-radius:50%;` +
        `background:#3A5A7A;transition:all .3s;display:inline-block;flex-shrink:0;"></span>` +
        `<span id="osim-srv-label">sin servidor</span>`;
      nav.appendChild(wrap);
    }

    const dot   = document.getElementById("osim-srv-dot");
    const label = document.getElementById("osim-srv-label");
    if (!dot || !label) return;

    if (online) {
      dot.style.background = "#7BC67E";
      dot.style.boxShadow  = "0 0 6px rgba(123,198,126,.55)";
      let txt = "servidor";
      if (clientes != null) txt += ` · ${clientes}c`;
      if (forksActivos)     txt += ` · ${forksActivos}f activos`;
      label.textContent = txt;
    } else {
      dot.style.background = "#3A5A7A";
      dot.style.boxShadow  = "none";
      label.textContent    = "sin servidor";
    }
  }

  /* ──────────────────────────────────────────────────────────
     UTILIDADES
  ────────────────────────────────────────────────────────── */
  function _parseEvento(raw) {
    try { return JSON.parse(raw); } catch (_) { return null; }
  }

  function _clearRetry() {
    if (_retryTimer) { clearTimeout(_retryTimer); _retryTimer = null; }
  }

  function _toast(msg, tipo) {
    if (typeof mostrarToast === "function") {
      mostrarToast(`[Servidor] ${msg}`, tipo, 4000);
    }
  }

  /* ──────────────────────────────────────────────────────────
     EXPORTAR API GLOBAL
  ────────────────────────────────────────────────────────── */
  window.OSimClient = {
    notificarInicio,
    notificarFin,
    isConnected: () => _connected,
  };

  /* ── Iniciar cuando el DOM esté listo ── */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", conectar);
  } else {
    conectar();
  }
})();

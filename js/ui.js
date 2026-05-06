/* ============================================================
   OSim — Funciones de UI compartidas
   Archivo: ui.js
   Instrucciones: Este archivo lo importan TODOS los módulos.
   NO modificar sin avisar al equipo.
   ============================================================ */

/* ----------------------------------------------------------
   FORMATO DE PROCESO — El único objeto válido en todo el proyecto

   const proceso = {
     pid:         1,          // número entero único
     arrivalTime: 0,          // número entero >= 0
     burstTime:   5,          // número entero > 0
     priority:    2,          // número entero (1 = más alta)
     pages:       4,          // número entero > 0
     type:        "fork",     // "fork" | "thread"
     state:       "ready"     // ver ESTADOS abajo
   };

   ESTADOS válidos: "new" | "ready" | "running" | "waiting" | "terminated"
   ---------------------------------------------------------- */

/* ----------------------------------------------------------
   1. CONSTANTES GLOBALES
   ---------------------------------------------------------- */

/** Estados válidos de un proceso */
const ESTADOS = ["new", "ready", "running", "waiting", "terminated"];

/** Colores asociados a cada proceso en el Gantt (índice = orden de proceso) */
const GANTT_COLORS = [
  "gantt-p1",
  "gantt-p2",
  "gantt-p3",
  "gantt-p4",
  "gantt-p5",
  "gantt-p6",
];

/* ----------------------------------------------------------
   2. VALIDACIÓN DE PROCESOS
   ---------------------------------------------------------- */

/**
 * Valida que un objeto proceso tenga todos los campos correctos.
 * @param {Object} proceso - Objeto a validar
 * @returns {{ valido: boolean, errores: string[] }}
 */
function validarProceso(proceso) {
  const errores = [];

  if (typeof proceso.pid !== "number" || proceso.pid <= 0)
    errores.push("PID debe ser un número entero positivo.");

  if (typeof proceso.arrivalTime !== "number" || proceso.arrivalTime < 0)
    errores.push("arrivalTime debe ser >= 0.");

  if (typeof proceso.burstTime !== "number" || proceso.burstTime <= 0)
    errores.push("burstTime debe ser > 0.");

  if (typeof proceso.priority !== "number" || proceso.priority < 1)
    errores.push("priority debe ser >= 1.");

  if (typeof proceso.pages !== "number" || proceso.pages < 1)
    errores.push("pages debe ser >= 1.");

  if (!ESTADOS.includes(proceso.state))
    errores.push(`state debe ser uno de: ${ESTADOS.join(", ")}.`);

  return { valido: errores.length === 0, errores };
}

/**
 * Crea un objeto proceso con valores por defecto.
 * Persona C lo usa al crear procesos desde el formulario.
 * @param {Partial<Object>} datos - Campos a sobrescribir
 * @returns {Object} proceso completo
 */
function crearProceso({ pid, arrivalTime = 0, burstTime = 1, priority = 1, pages = 1, type = "fork", state = "new" } = {}) {
  return { pid, arrivalTime, burstTime, priority, pages, type, state };
}

/* ----------------------------------------------------------
   3. BADGES DE ESTADO Y TIPO
   ---------------------------------------------------------- */

/**
 * Devuelve el HTML de un badge de tipo (fork / thread).
 * @param {string} type - "fork" | "thread"
 * @returns {string} HTML string
 */
function badgeTipo(type) {
  if (type === "thread") {
    return `<span class="type-badge type-thread" title="Thread: comparte espacio de memoria con el proceso padre">⧉ Thread</span>`;
  }
  return `<span class="type-badge type-fork" title="Fork: proceso independiente con su propio espacio de memoria">⑂ Fork</span>`;
}

/**
 * Devuelve el HTML de un badge de estado con el color correcto.
 * @param {string} state - Estado del proceso
 * @returns {string} HTML string
 *
 * Uso: elemento.innerHTML = badgeEstado("running");
 */
function badgeEstado(state) {
  const labels = {
    new:        "New",
    ready:      "Ready",
    running:    "Running",
    waiting:    "Waiting",
    terminated: "Terminated",
  };
  const label = labels[state] ?? state;
  return `<span class="badge badge-${state}">${label}</span>`;
}

/* ----------------------------------------------------------
   4. TARJETAS DE MÉTRICA
   ---------------------------------------------------------- */

/**
 * Crea el HTML de una tarjeta de métrica.
 * @param {string} label    - Etiqueta de la métrica
 * @param {string|number} value - Valor a mostrar
 * @param {string} [tipo]   - "" | "fault" | "good" (define el color del valor)
 * @returns {string} HTML string
 *
 * Uso: metricasGrid.innerHTML = crearMetrica("Avg Waiting Time", "4.3s");
 */
function crearMetrica(label, value, tipo = "") {
  return `
    <div class="metric-card">
      <div class="metric-label">${label}</div>
      <div class="metric-value ${tipo}">${value}</div>
    </div>
  `;
}

/**
 * Rellena un contenedor .metrics-grid con varias métricas.
 * @param {HTMLElement} contenedor - El div con clase metrics-grid
 * @param {Array<{label, value, tipo}>} metricas - Lista de métricas
 *
 * Uso:
 *   const datos = [
 *     { label: "Avg Waiting", value: "4.3s" },
 *     { label: "Page Faults", value: 3, tipo: "fault" }
 *   ];
 *   renderMetricas(document.getElementById("metricas"), datos);
 */
function renderMetricas(contenedor, metricas) {
  contenedor.innerHTML = metricas
    .map(({ label, value, tipo }) => crearMetrica(label, value, tipo))
    .join("");
}

/* ----------------------------------------------------------
   5. FORMATEO DE NÚMEROS
   ---------------------------------------------------------- */

/**
 * Redondea un número a N decimales. Usar siempre para mostrar números.
 * @param {number} n
 * @param {number} decimales
 * @returns {string}
 */
function fmt(n, decimales = 2) {
  return parseFloat(n.toFixed(decimales)).toString();
}

/**
 * Formatea milisegundos a texto legible.
 * @param {number} ms
 * @returns {string}
 */
function fmtTiempo(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${fmt(ms / 1000, 1)}s`;
}

/* ----------------------------------------------------------
   6. TABLA DE PROCESOS
   ---------------------------------------------------------- */

/**
 * Renderiza una tabla de procesos en un contenedor.
 * @param {HTMLElement} contenedor
 * @param {Object[]} procesos
 * @param {string[]} [columnas] - Columnas a mostrar (todas por defecto)
 *
 * Columnas disponibles: pid, arrivalTime, burstTime, priority, pages, state
 *
 * Uso: renderTabla(document.getElementById("tabla"), procesos);
 */
function renderTabla(contenedor, procesos, columnas = ["pid", "arrivalTime", "burstTime", "priority", "pages", "state"]) {
  const headers = {
    pid:         "PID",
    arrivalTime: "Arrival",
    burstTime:   "Burst",
    priority:    "Priority",
    pages:       "Pages",
    state:       "State",
  };

  const filas = procesos.map((p) => {
    const celdas = columnas.map((col) => {
      if (col === "state") {
        return `<td>${badgeEstado(p.state)}</td>`;
      }
      const esNum = typeof p[col] === "number";
      return `<td class="${esNum ? "mono" : ""}">${p[col] ?? "—"}</td>`;
    });
    return `<tr>${celdas.join("")}</tr>`;
  });

  contenedor.innerHTML = `
    <table class="process-table">
      <thead>
        <tr>${columnas.map((c) => `<th>${headers[c]}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${filas.join("") || "<tr><td colspan='6' style='text-align:center;color:var(--text-muted);padding:20px;'>Sin procesos</td></tr>"}
      </tbody>
    </table>
  `;
}

/* ----------------------------------------------------------
   7. GANTT
   ---------------------------------------------------------- */

/**
 * Renderiza el diagrama de Gantt en un contenedor.
 * @param {HTMLElement} contenedor
 * @param {Object[]} procesos  - Lista de procesos originales (para los PIDs)
 * @param {Object[]} schedule  - Resultado del scheduling.
 *    Cada elemento: { pid, start, end }
 *    Ejemplo: [{ pid: 1, start: 0, end: 5 }, { pid: 2, start: 5, end: 8 }]
 *
 * Uso (desde scheduling.js):
 *   const resultado = [{ pid:1, start:0, end:5 }, { pid:2, start:5, end:8 }];
 *   renderGantt(document.getElementById("gantt"), procesos, resultado);
 */
function renderGantt(contenedor, procesos, schedule) {
  if (!schedule || schedule.length === 0) {
    contenedor.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">Sin datos de scheduling.</p>`;
    return;
  }

  const tiempoTotal = Math.max(...schedule.map((s) => s.end));

  /* Agrupar bloques por PID */
  const pids = [...new Set(procesos.map((p) => p.pid))];
  const colorMap = {};
  pids.forEach((pid, i) => {
    colorMap[pid] = GANTT_COLORS[i % GANTT_COLORS.length];
  });

  /* Una fila por proceso */
  const filas = pids.map((pid) => {
    const bloques = schedule.filter((s) => s.pid === pid);
    const bHtml = bloques
      .map((b) => {
        const left = (b.start / tiempoTotal) * 100;
        const width = ((b.end - b.start) / tiempoTotal) * 100;
        return `
          <div class="gantt-block ${colorMap[pid]}"
               style="left:${fmt(left, 2)}%;width:${fmt(width, 2)}%;"
               title="P${pid}: t${b.start}→t${b.end}">
            ${b.end - b.start > 0 ? `${b.end - b.start}s` : ""}
          </div>`;
      })
      .join("");

    return `
      <div class="gantt-row">
        <span class="gantt-pid">P${pid}</span>
        <div class="gantt-track">${bHtml}</div>
      </div>`;
  });

  /* Ticks de tiempo */
  const tickCount = Math.min(tiempoTotal, 10);
  const step = Math.ceil(tiempoTotal / tickCount);
  const ticks = [];
  for (let t = 0; t <= tiempoTotal; t += step) {
    const left = (t / tiempoTotal) * 100;
    ticks.push(`<span class="gantt-tick" style="position:absolute;left:${fmt(left, 1)}%;transform:translateX(-50%)">${t}</span>`);
  }

  contenedor.innerHTML = `
    <div class="gantt-container">
      ${filas.join("")}
      <div style="position:relative;height:16px;margin-left:38px;">${ticks.join("")}</div>
    </div>
  `;
}

/* ----------------------------------------------------------
   8. MARCOS DE MEMORIA
   ---------------------------------------------------------- */

/**
 * Renderiza la cuadrícula de marcos de memoria.
 * @param {HTMLElement} contenedor
 * @param {Object[]} marcos - Array de marcos.
 *    Cada marco: { indice, pagina, proceso, estado }
 *    estado: "empty" | "used" | "fault" | "evicted"
 *
 * Uso (desde paginacion.js):
 *   const marcos = [
 *     { indice: 0, pagina: 0, proceso: 1, estado: "used" },
 *     { indice: 1, pagina: null, proceso: null, estado: "empty" }
 *   ];
 *   renderMarcos(document.getElementById("memoria"), marcos, 8);
 */
function renderMarcos(contenedor, marcos, columnas = 8) {
  contenedor.style.gridTemplateColumns = `repeat(${columnas}, 1fr)`;

  const html = marcos.map((m) => {
    const contenido = m.estado === "empty"
      ? `<span class="memory-frame-index">#${m.indice}</span><span class="memory-frame-content">—</span>`
      : `<span class="memory-frame-index">#${m.indice}</span><span class="memory-frame-content">P${m.proceso}·${m.pagina}</span>`;

    return `<div class="memory-frame frame-${m.estado}">${contenido}</div>`;
  });

  contenedor.innerHTML = html.join("");
}

/* ----------------------------------------------------------
   9. CARGA DESDE ARCHIVO .TXT
   ---------------------------------------------------------- */

/**
 * Lee un archivo procesos.txt y devuelve un array de procesos.
 * Formato esperado del archivo:
 *   PID,Arrival,Burst,Priority,Pages
 *   1,0,5,2,4
 *   2,1,3,1,3
 *
 * @param {string} contenido - Texto del archivo
 * @returns {{ procesos: Object[], errores: string[] }}
 *
 * Uso (desde index.js o procesos.js):
 *   const texto = e.target.result;
 *   const { procesos, errores } = parsearArchivoP(texto);
 */
function parsearArchivoProcesos(contenido) {
  const lineas = contenido.trim().split("\n");
  const procesos = [];
  const errores = [];

  /* Saltar la cabecera */
  const inicio = lineas[0].toLowerCase().includes("pid") ? 1 : 0;

  lineas.slice(inicio).forEach((linea, i) => {
    const partes = linea.trim().split(",");
    if (partes.length < 5) {
      errores.push(`Línea ${i + inicio + 1}: formato incorrecto (se esperan 5 campos).`);
      return;
    }

    const [pid, arrivalTime, burstTime, priority, pages] = partes.map(Number);

    if ([pid, arrivalTime, burstTime, priority, pages].some(isNaN)) {
      errores.push(`Línea ${i + inicio + 1}: contiene valores no numéricos.`);
      return;
    }

    const p = crearProceso({ pid, arrivalTime, burstTime, priority, pages, state: "new" });
    const { valido, errores: errs } = validarProceso(p);

    if (!valido) {
      errores.push(`Línea ${i + inicio + 1}: ${errs.join(" ")}`);
    } else {
      procesos.push(p);
    }
  });

  return { procesos, errores };
}

/**
 * Lee un archivo memoria.txt y devuelve la configuración de memoria.
 * Formato esperado:
 *   Memoria=64
 *   PageSize=4
 *   Frames=16
 *
 * @param {string} contenido - Texto del archivo
 * @returns {{ config: Object, errores: string[] }}
 */
function parsearArchivoMemoria(contenido) {
  const config = {};
  const errores = [];

  contenido.trim().split("\n").forEach((linea) => {
    const [clave, valor] = linea.split("=");
    if (!clave || !valor) return;
    const n = Number(valor.trim());
    if (isNaN(n)) {
      errores.push(`Valor no numérico en: ${linea.trim()}`);
    } else {
      config[clave.trim().toLowerCase()] = n;
    }
  });

  const requeridos = ["memoria", "pagesize", "frames"];
  requeridos.forEach((k) => {
    if (!(k in config)) errores.push(`Falta el campo: ${k}`);
  });

  return { config, errores };
}

/* ----------------------------------------------------------
   10. NOTIFICACIONES / TOAST
   ---------------------------------------------------------- */

/**
 * Muestra una notificación temporal (toast) en la esquina inferior derecha.
 * @param {string} mensaje
 * @param {"info"|"success"|"error"} [tipo]
 * @param {number} [duracion] - Milisegundos
 *
 * Uso: mostrarToast("Algoritmo cambiado a FIFO", "success");
 */
function mostrarToast(mensaje, tipo = "info", duracion = 3000) {
  /* Crear contenedor si no existe */
  let wrapper = document.getElementById("toast-wrapper");
  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.id = "toast-wrapper";
    wrapper.style.cssText = `
      position: fixed; bottom: 24px; right: 24px;
      display: flex; flex-direction: column; gap: 8px;
      z-index: 9999;
    `;
    document.body.appendChild(wrapper);
  }

  const colores = {
    info:    { bg: "var(--color-blue-50)",      border: "var(--color-blue-200)", text: "var(--color-blue-900)" },
    success: { bg: "var(--color-running-bg)",   border: "#C0DD97",              text: "#27500A" },
    error:   { bg: "var(--color-fault-bg)",     border: "#F09595",              text: "var(--color-fault-dark)" },
  };
  const c = colores[tipo] ?? colores.info;

  const toast = document.createElement("div");
  toast.style.cssText = `
    background: ${c.bg};
    border: 0.5px solid ${c.border};
    color: ${c.text};
    padding: 10px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-family: var(--font-sans);
    box-shadow: 0 4px 12px rgba(0,0,0,0.12);
    animation: toastIn 0.2s ease;
    max-width: 300px;
  `;
  toast.textContent = mensaje;

  /* Animación CSS inline */
  const style = document.createElement("style");
  style.textContent = `
    @keyframes toastIn  { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
    @keyframes toastOut { from { opacity:1; } to { opacity:0; } }
  `;
  if (!document.head.querySelector("#toast-style")) {
    style.id = "toast-style";
    document.head.appendChild(style);
  }

  wrapper.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = "toastOut 0.2s ease forwards";
    setTimeout(() => toast.remove(), 220);
  }, duracion);
}

/* ----------------------------------------------------------
   11. EXPORTAR — disponible globalmente
   ---------------------------------------------------------- */

function _csvEscape(valor) {
  const s = String(valor ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function _csvFila(celdas) {
  return celdas.map(_csvEscape).join(",");
}

function _descargarCSV(contenido, nombre) {
  const blob = new Blob([contenido], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = nombre; a.click();
  URL.revokeObjectURL(url);
}

/**
 * Exporta el historial de paginación a CSV.
 * Extrae referencias numéricas con regex /(\d+)/g.
 */
function exportarCSVPaginacion() {
  if (typeof historial === "undefined" || !historial.length) {
    mostrarToast("Sin datos para exportar. Ejecuta una simulación primero.", "error");
    return;
  }
  const numFrames = historial[0].frames.length;
  const headers   = ["Paso", "Referencia",
    ...Array.from({ length: numFrames }, (_, i) => `Marco_${i + 1}`),
    "Tipo", "Pagina_Expulsada"];

  // Regex: extrae tokens numéricos de la cadena ingresada por el usuario
  const refStr  = document.getElementById("inp-referencias")?.value ?? "";
  const refsRaw = [...refStr.matchAll(/(\d+)/g)].map(m => m[1]);

  const filas = historial.map((paso, i) => [
    i + 1, paso.referencia,
    ...paso.frames.map(f => f ?? "-"),
    paso.fault ? "Fallo" : "Hit",
    paso.paginaExpulsada ?? "-",
  ]);

  const algo = typeof algoritmoActivo !== "undefined" ? algoritmoActivo.toUpperCase() : "SIM";
  const csv  = [
    `# Algoritmo: ${algo}`,
    `# Referencias (regex /(\\d+)/g aplicado): ${refsRaw.join(" ")}`,
    `# Marcos: ${numFrames}`,
    "",
    _csvFila(headers),
    ...filas.map(_csvFila),
  ].join("\r\n");

  _descargarCSV(csv, `paginacion_${algo.toLowerCase()}_${Date.now()}.csv`);
  mostrarToast("CSV exportado correctamente", "success");
}

/**
 * Exporta el resultado del scheduling a CSV.
 * Extrae valores numéricos de las métricas con regex /[\d.]+/g.
 */
function exportarCSVScheduling() {
  if (typeof resultadoActual === "undefined" || !resultadoActual) {
    mostrarToast("Sin datos para exportar. Ejecuta una simulación primero.", "error");
    return;
  }
  const headers = ["PID", "BurstTime", "ArrivalTime", "Priority",
                   "StartTime", "FinishTime", "WaitingTime", "Turnaround"];
  const filas   = resultadoActual.procesos.map(p => [
    p.pid,
    p.burstTime,
    p.arrivalTime    ?? 0,
    p.priority       ?? "-",
    p.startTime      ?? "-",
    p.finishTime     ?? "-",
    p.waitingTime    ?? "-",
    p.turnaroundTime ?? "-",
  ]);

  // Regex: extrae todos los valores numéricos del objeto de métricas
  const metStr  = JSON.stringify(resultadoActual.metricas ?? {});
  const metVals = [...metStr.matchAll(/([\d.]+)/g)].map(m => m[1]);

  const algo = resultadoActual.algoritmo ?? "sim";
  const csv  = [
    `# Algoritmo: ${algo}`,
    `# Métricas (regex /([\\d.]+)/g aplicado): ${metVals.join(" ")}`,
    "",
    _csvFila(headers),
    ...filas.map(_csvFila),
  ].join("\r\n");

  _descargarCSV(csv, `scheduling_${algo}_${Date.now()}.csv`);
  mostrarToast("CSV exportado correctamente", "success");
}

/*
  Cómo usar este archivo en cualquier módulo:
  <script src="../js/ui.js"></script>

  Luego llamar directamente:
    badgeEstado("running")
    crearMetrica("Waiting", "4.3s")
    renderTabla(el, procesos)
    renderGantt(el, procesos, schedule)
    renderMarcos(el, marcos, 8)
    mostrarToast("Simulación completada", "success")
    parsearArchivoProcesos(textoDelArchivo)
    parsearArchivoMemoria(textoDelArchivo)
    fmt(4.33333)            → "4.33"
    fmtTiempo(3500)         → "3.5s"
    validarProceso(p)       → { valido: true, errores: [] }
    crearProceso({ pid:1, burstTime:5 })
*/
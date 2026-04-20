/* ============================================================
   OSim — Controlador UI para Scheduling
   Archivo: scheduling-ui.js
   Descripción: Maneja interacción, renderizado visual y animaciones
   ============================================================ */

let resultadoActual = null;
let algoritmoSeleccionado = "fcfs";

// Algoritmos que usan el campo Priority
const ALGOS_CON_PRIORIDAD = new Set(["priority", "mlq"]);

/* ----------------------------------------------------------
   1. INICIALIZACIÓN
   ---------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".algo-item").forEach((btn) => {
    btn.addEventListener("click", (e) => seleccionarAlgoritmo(e.currentTarget.dataset.algo));
  });

  document.getElementById("btnExecute")?.addEventListener("click", ejecutarSimulacion);
  document.getElementById("btnReset")?.addEventListener("click", limpiarGantt);
  document.getElementById("fileInput")?.addEventListener("change", (e) => {
    if (e.target.files[0]) cargarDesdearchivo(e.target.files[0]);
  });
  document.getElementById("btnAddProcess")?.addEventListener("click", agregarProceso);
  document.getElementById("btnClearAll")?.addEventListener("click", limpiarTodos);

  // Estado inicial: FCFS → Priority no aplica
  _togglePriorityField(false);
});

/* ----------------------------------------------------------
   2. SELECCIONAR ALGORITMO
   ---------------------------------------------------------- */

function seleccionarAlgoritmo(algo) {
  algoritmoSeleccionado = algo;

  // Actualizar botones — añadir ring al activo
  document.querySelectorAll(".algo-item").forEach((btn) => {
    btn.classList.remove("active", "algo-ring");
  });
  const btnActivo = document.querySelector(`[data-algo="${algo}"]`);
  if (btnActivo) {
    btnActivo.classList.add("active");
    // Forzar reflow para reiniciar animación
    void btnActivo.offsetWidth;
    btnActivo.classList.add("algo-ring");
  }

  // Mostrar/ocultar quantum
  document.getElementById("quantumControl").style.display = algo === "rr" ? "flex" : "none";

  // Habilitar / deshabilitar campo Priority
  _togglePriorityField(ALGOS_CON_PRIORIDAD.has(algo));

  // Actualizar título del Gantt
  const nombres = {
    fcfs:     "FCFS — First Come First Served",
    sjf:      "SJF — Shortest Job First",
    hrrn:     "HRRN — Highest Response Ratio Next",
    rr:       "Round Robin",
    srtf:     "SRTF — Shortest Remaining Time",
    priority: "Priority (Preemptive)",
    mlq:      "Multilevel Queue",
    mlfq:     "Multilevel Feedback Queue",
  };
  const titulo = document.getElementById("ganttTitle");
  if (titulo) {
    titulo.style.opacity = "0";
    titulo.style.transform = "translateY(4px)";
    setTimeout(() => {
      titulo.textContent = `Diagrama de Gantt — ${nombres[algo] || algo}`;
      titulo.style.transition = "opacity 0.2s ease, transform 0.2s ease";
      titulo.style.opacity = "1";
      titulo.style.transform = "translateY(0)";
    }, 120);
  }
}

function _togglePriorityField(activo) {
  const grupo = document.getElementById("groupPriority");
  if (!grupo) return;
  grupo.style.display = activo ? "" : "none";
}

/* ----------------------------------------------------------
   3. EJECUTAR SIMULACIÓN
   ---------------------------------------------------------- */

function ejecutarSimulacion() {
  if (procesosGlobales.length === 0) {
    alert("Agrega procesos primero");
    return;
  }

  let quantum = 2;
  if (algoritmoSeleccionado === "rr") {
    quantum = parseInt(document.getElementById("quantumValue").value) || 2;
  }

  resultadoActual = ejecutarAlgoritmo(algoritmoSeleccionado, procesosGlobales, quantum);
  if (!resultadoActual) return;

  // Marcar canvas como "cargando"
  const canvas = document.getElementById("ganttCanvas");
  if (canvas) canvas.classList.add("gantt-loading");

  dibujarGantt();
  actualizarMetricas();
  actualizarQueueDinámica();

  localStorage.setItem('osim_scheduling', JSON.stringify({
    algoritmo: resultadoActual.algoritmo,
    avgWaiting: resultadoActual.metricas.avgWaiting,
    avgTurnaround: resultadoActual.metricas.avgTurnaround,
    cpuUtilization: resultadoActual.metricas.cpuUtilization,
    makespan: resultadoActual.metricas.makespan,
    totalProcesos: resultadoActual.procesos.length
  }));
  
}

/* ----------------------------------------------------------
   4. DIBUJAR GANTT EN CANVAS — con animación de barrido
   ---------------------------------------------------------- */

function dibujarGantt() {
  const canvas = document.getElementById("ganttCanvas");
  if (!canvas || !resultadoActual) return;

  const ctx   = canvas.getContext("2d");
  const ancho = canvas.offsetWidth;
  const alto  = canvas.offsetHeight;
  canvas.width  = ancho;
  canvas.height = alto;

  // Usar segmentos cronológicos; fallback a un bloque por proceso
  const segments = resultadoActual.segments ||
    [...resultadoActual.procesos]
      .sort((a, b) => a.startTime - b.startTime)
      .map(p => ({ pid: p.pid, start: p.startTime, end: p.finishTime }));

  const makespan = resultadoActual.metricas.makespan;
  if (!segments.length || makespan === 0) return;

  // PIDs únicos en orden de primera aparición (para filas del Gantt)
  const seenPids = [];
  segments.forEach(s => { if (!seenPids.includes(s.pid)) seenPids.push(s.pid); });

  const margenIzq    = 54;
  const margenDer    = 20;
  const margenArriba = 24;
  const margenAbajo  = 44;
  const anchoGrafico  = ancho - margenIzq - margenDer;
  const altoGrafico   = alto  - margenArriba - margenAbajo;
  const alturaProceso = Math.min(38, altoGrafico / seenPids.length);
  const espacioFila   = alturaProceso + 6;

  const colores  = ["#3d687b","#639922","#EF9F27","#E24B4A","#8B77D4","#1DB884","#FF6B6B","#4ECDC4"];
  const pidToIdx = {};
  seenPids.forEach((pid, i) => { pidToIdx[pid] = i; });

  const off    = document.createElement("canvas");
  off.width    = ancho;
  off.height   = alto;
  const offCtx = off.getContext("2d");

  // Fondo
  offCtx.fillStyle = "#F4F6F9";
  offCtx.fillRect(0, 0, ancho, alto);

  // Ejes
  offCtx.strokeStyle = "#000000";
  offCtx.lineWidth   = 1.5;
  offCtx.beginPath();
  offCtx.moveTo(margenIzq, margenArriba);
  offCtx.lineTo(margenIzq, altoGrafico + margenArriba);
  offCtx.lineTo(ancho - margenDer, altoGrafico + margenArriba);
  offCtx.stroke();

  // Ticks y guías verticales de tiempo
  const paso = Math.ceil(makespan / 10);
  offCtx.fillStyle  = "#8298AC";
  offCtx.font       = "10px 'IBM Plex Mono', monospace";
  offCtx.textAlign  = "center";
  for (let t = 0; t <= makespan; t += paso) {
    const x = margenIzq + (t / makespan) * anchoGrafico;
    offCtx.save();
    offCtx.strokeStyle = "rgba(0,0,0,0.07)";
    offCtx.lineWidth   = 1;
    offCtx.beginPath();
    offCtx.moveTo(x, margenArriba);
    offCtx.lineTo(x, altoGrafico + margenArriba);
    offCtx.stroke();
    offCtx.restore();
    offCtx.fillText(t, x, altoGrafico + margenArriba + 16);
  }

  // Etiquetas PID en el eje Y
  seenPids.forEach((pid, idx) => {
    const y = margenArriba + idx * espacioFila;
    offCtx.fillStyle  = "#000000";
    offCtx.font       = "bold 11px 'IBM Plex Mono', monospace";
    offCtx.textAlign  = "right";
    offCtx.fillText(`P${pid}`, margenIzq - 8, y + alturaProceso / 2 + 4);
  });

  // Bloques por segmento (un proceso puede tener múltiples bloques)
  segments.forEach(seg => {
    const idx         = pidToIdx[seg.pid];
    const color       = colores[idx % colores.length];
    const y           = margenArriba + idx * espacioFila;
    const xBloque     = margenIzq + (seg.start / makespan) * anchoGrafico;
    const anchoBloque = ((seg.end - seg.start) / makespan) * anchoGrafico;
    if (anchoBloque < 1) return;

    const grad = offCtx.createLinearGradient(xBloque, y, xBloque, y + alturaProceso);
    grad.addColorStop(0, _colorBright(color));
    grad.addColorStop(1, color);

    offCtx.shadowColor   = "rgba(0,0,0,0.18)";
    offCtx.shadowBlur    = 4;
    offCtx.shadowOffsetY = 2;
    _roundRect(offCtx, xBloque, y, anchoBloque, alturaProceso, 4);
    offCtx.fillStyle = grad;
    offCtx.fill();

    offCtx.shadowBlur    = 0;
    offCtx.shadowOffsetY = 0;
    offCtx.strokeStyle   = "rgba(0,0,0,0.25)";
    offCtx.lineWidth     = 1;
    _roundRect(offCtx, xBloque, y, anchoBloque, alturaProceso, 4);
    offCtx.stroke();

    if (anchoBloque > 22) {
      offCtx.fillStyle = "#FFFFFF";
      offCtx.font      = `bold ${Math.min(11, anchoBloque / 3)}px 'IBM Plex Mono', monospace`;
      offCtx.textAlign = "center";
      offCtx.fillText(`P${seg.pid}`, xBloque + anchoBloque / 2, y + alturaProceso / 2 + 4);
    }
  });

  // Marcadores de cambio de contexto — línea roja punteada donde cambia el proceso en CPU
  for (let i = 1; i < segments.length; i++) {
    if (segments[i].pid !== segments[i - 1].pid) {
      const x = margenIzq + (segments[i].start / makespan) * anchoGrafico;
      offCtx.save();
      offCtx.strokeStyle = "rgba(220,50,50,0.5)";
      offCtx.lineWidth   = 1.5;
      offCtx.setLineDash([3, 3]);
      offCtx.beginPath();
      offCtx.moveTo(x, margenArriba);
      offCtx.lineTo(x, altoGrafico + margenArriba);
      offCtx.stroke();
      offCtx.restore();
    }
  }

  // Animación de barrido izquierda → derecha
  const DUR   = 750;
  const start = performance.now();
  function frame(ahora) {
    const t    = Math.min((ahora - start) / DUR, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    ctx.clearRect(0, 0, ancho, alto);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, margenIzq + anchoGrafico * ease, alto);
    ctx.clip();
    ctx.drawImage(off, 0, 0);
    ctx.restore();
    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      canvas.classList.remove("gantt-loading");
      actualizarTimelineGantt(makespan, paso);
    }
  }
  requestAnimationFrame(frame);
}

/* Aux: rect redondeado compatible */
function _roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/* Aux: aclarar un color hex */
function _colorBright(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  const factor = 1.22;
  return `rgb(${Math.min(255,r*factor)|0},${Math.min(255,g*factor)|0},${Math.min(255,b*factor)|0})`;
}

function actualizarTimelineGantt(makespan, paso) {
  const timeline = document.getElementById("ganttTimeline");
  if (!timeline) return;
  timeline.innerHTML = "";
  for (let t = 0; t <= makespan; t += (paso || Math.ceil(makespan / 10))) {
    const span = document.createElement("span");
    span.textContent = t;
    timeline.appendChild(span);
  }
}

/* ----------------------------------------------------------
   5. ACTUALIZAR MÉTRICAS — con animación count-up y pop
   ---------------------------------------------------------- */

function actualizarMetricas() {
  if (!resultadoActual) return;
  const m = resultadoActual.metricas;

  const datos = [
    { label: "Avg Waiting",      raw: m.avgWaiting,                          sufijo: "ms" },
    { label: "Avg Turnaround",   raw: m.avgTurnaround,                       sufijo: "ms" },
    { label: "Avg Response",     raw: m.avgResponse,                         sufijo: "ms" },
    { label: "CPU Utilization",  raw: m.cpuUtilization,                      sufijo: "", clase: "good" },
    { label: "Makespan",         raw: m.makespan,                            sufijo: "ms" },
    { label: "Context Switches", raw: resultadoActual.contextSwitches ?? 0,  sufijo: "" },
  ];

  const lista = document.getElementById("metricsList");
  if (!lista) return;

  lista.innerHTML = datos.map((d, i) => `
    <div class="metric-row metric-pop" style="animation-delay:${i * 55}ms; opacity:0">
      <span class="metric-label">${d.label}</span>
      <span class="metric-value ${d.clase || ""}" data-target="${d.raw}" data-sufijo="${d.sufijo}">0${d.sufijo}</span>
    </div>`).join("");

  // Animar cada valor contando desde 0
  lista.querySelectorAll(".metric-value[data-target]").forEach((el) => {
    const destino  = parseFloat(el.dataset.target) || 0;
    const sufijo   = el.dataset.sufijo;
    const esPct    = String(el.dataset.target).includes("%");
    const textoFin = esPct ? String(el.dataset.target) : null;

    if (esPct) { setTimeout(() => { el.textContent = textoFin; }, 650); return; }

    const dur   = 650;
    const start = performance.now();
    function tick(ahora) {
      const t     = Math.min((ahora - start) / dur, 1);
      const ease  = 1 - Math.pow(1 - t, 2);
      const val   = destino * ease;
      el.textContent = (Number.isInteger(destino) ? Math.round(val) : val.toFixed(2)) + sufijo;
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

/* ----------------------------------------------------------
   6. ACTUALIZAR QUEUE DINÁMICA — stagger bounce-in
   ---------------------------------------------------------- */

function actualizarQueueDinámica() {
  if (!resultadoActual) return;

  const queueItems = document.getElementById("queueItems");
  if (!queueItems) return;
  queueItems.innerHTML = "";

  resultadoActual.procesos.forEach((p, i) => {
    const item = document.createElement("div");
    item.className = "queue-item queue-enter";
    item.style.animationDelay = `${i * 60}ms`;
    item.style.opacity = "0";
    item.textContent = `P${p.pid}`;

    // El primero en la cola luce como "running"
    if (i === 0) item.classList.add("running");

    queueItems.appendChild(item);
  });
}

/* ----------------------------------------------------------
   7. LIMPIAR GANTT
   ---------------------------------------------------------- */

function limpiarGantt() {
  const canvas = document.getElementById("ganttCanvas");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#F4F6F9";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    canvas.classList.remove("gantt-loading");
  }

  document.getElementById("metricsList").innerHTML = `
    <div class="metric-row"><span class="metric-label">Avg Waiting</span><span class="metric-value">—</span></div>
    <div class="metric-row"><span class="metric-label">Avg Turnaround</span><span class="metric-value">—</span></div>
    <div class="metric-row"><span class="metric-label">Avg Response</span><span class="metric-value">—</span></div>
    <div class="metric-row"><span class="metric-label">CPU Utilization</span><span class="metric-value good">—</span></div>
    <div class="metric-row"><span class="metric-label">Makespan</span><span class="metric-value">—</span></div>
    <div class="metric-row"><span class="metric-label">Context Switches</span><span class="metric-value">—</span></div>
  `;

  const timeline = document.getElementById("ganttTimeline");
  if (timeline) timeline.innerHTML = "";

  resultadoActual = null;
}

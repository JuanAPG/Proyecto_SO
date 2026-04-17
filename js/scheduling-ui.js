/* ============================================================
   OSim — Controlador UI para Scheduling
   Archivo: scheduling-ui.js
   Descripción: Maneja interacción y renderizado visual
   ============================================================ */

let resultadoActual = null;
let algoritmoSeleccionado = "fcfs";

/* ----------------------------------------------------------
   1. INICIALIZACIÓN
   ---------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", () => {
  // Selector de algoritmos
  document.querySelectorAll(".algo-item").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      seleccionarAlgoritmo(e.target.dataset.algo);
    });
  });

  // Botón ejecutar
  document.getElementById("btnExecute")?.addEventListener("click", ejecutarSimulacion);

  // Botón reset
  document.getElementById("btnReset")?.addEventListener("click", limpiarGantt);

  // Input quantum
  document.getElementById("quantumValue")?.addEventListener("change", (e) => {
    // Se usará al ejecutar
  });
});

/* ----------------------------------------------------------
   2. SELECCIONAR ALGORITMO
   ---------------------------------------------------------- */

function seleccionarAlgoritmo(algo) {
  algoritmoSeleccionado = algo;

  // Actualizar botones activos
  document.querySelectorAll(".algo-item").forEach((btn) => {
    btn.classList.remove("active");
  });
  document.querySelector(`[data-algo="${algo}"]`).classList.add("active");

  // Mostrar/ocultar quantum control
  const quantumControl = document.getElementById("quantumControl");
  if (algo === "rr") {
    quantumControl.style.display = "flex";
  } else {
    quantumControl.style.display = "none";
  }

  // Actualizar título del Gantt
  const nombreAlgo = {
    fcfs: "FCFS",
    sjf: "SJF",
    hrrn: "HRRN",
    rr: "Round Robin",
    srtf: "SRTF",
    priority: "Priority Preemptive",
    mlq: "Multilevel Queue",
    mlfq: "Multilevel Feedback Queue",
  };

  document.getElementById("ganttTitle").textContent =
    `Diagrama de Gantt — ${nombreAlgo[algo] || algo}`;
}

/* ----------------------------------------------------------
   3. EJECUTAR SIMULACIÓN
   ---------------------------------------------------------- */

function ejecutarSimulacion() {
  if (procesosGlobales.length === 0) {
    alert("Agrega procesos primero");
    return;
  }

  // Obtener quantum si es necesario
  let quantum = 2;
  if (algoritmoSeleccionado === "rr") {
    quantum = parseInt(document.getElementById("quantumValue").value) || 2;
  }

  // Ejecutar algoritmo
  resultadoActual = ejecutarAlgoritmo(algoritmoSeleccionado, procesosGlobales, quantum);

  if (!resultadoActual) {
    return;
  }

  // Renderizar
  dibujarGantt();
  actualizarMetricas();
  actualizarQueueDinámica();
}

/* ----------------------------------------------------------
   4. DIBUJAR GANTT EN CANVAS
   ---------------------------------------------------------- */

function dibujarGantt() {
  const canvas = document.getElementById("ganttCanvas");
  if (!canvas || !resultadoActual) return;

  const ctx = canvas.getContext("2d");
  const ancho = canvas.offsetWidth;
  const alto = canvas.offsetHeight;

  // Configurar dimensiones reales del canvas
  canvas.width = ancho;
  canvas.height = alto;

  const procesos = resultadoActual.procesos;
  const makespan = resultadoActual.metricas.makespan;

  if (makespan === 0) return;

  // Parámetros de dibujo
  const margenIzq = 50;
  const margenDer = 20;
  const margenArriba = 20;
  const margenAbajo = 40;

  const anchoGrafico = ancho - margenIzq - margenDer;
  const altoGrafico = alto - margenArriba - margenAbajo;
  const alturaPorProceso = Math.min(40, altoGrafico / procesos.length);
  const espacioEntreFilas = alturaPorProceso + 5;

  // Colores por PID
  const coloresPID = [
    "#185FA5",
    "#639922",
    "#EF9F27",
    "#E24B4A",
    "#8B77D4",
    "#1DB884",
    "#FF6B6B",
    "#4ECDC4",
  ];

  // Limpiar canvas
  ctx.fillStyle = "#F4F6F9";
  ctx.fillRect(0, 0, ancho, alto);

  // Línea de tiempo (eje X)
  ctx.strokeStyle = "#042C53";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(margenIzq, margenArriba);
  ctx.lineTo(margenIzq, altoGrafico + margenArriba);
  ctx.lineTo(ancho - margenDer, altoGrafico + margenArriba);
  ctx.stroke();

  // Dibujar números de tiempo
  ctx.fillStyle = "#0D1B2A";
  ctx.font = "11px var(--font-mono)";
  ctx.textAlign = "center";

  const incrementoTiempo = Math.ceil(makespan / 10);
  for (let t = 0; t <= makespan; t += incrementoTiempo) {
    const x = margenIzq + (t / makespan) * anchoGrafico;
    ctx.fillText(t, x, altoGrafico + margenArriba + 20);
  }

  // Dibujar cada fila de proceso
  procesos.forEach((p, idx) => {
    const y = margenArriba + idx * espacioEntreFilas;

    // Etiqueta PID
    ctx.fillStyle = "#0D1B2A";
    ctx.font = "bold 12px var(--font-mono)";
    ctx.textAlign = "right";
    ctx.fillText(`P${p.pid}`, margenIzq - 10, y + alturaPorProceso / 2 + 4);

    // Bloque del proceso
    const xInicio = margenIzq + (p.startTime / makespan) * anchoGrafico;
    const anchobloque =
      ((p.finishTime - p.startTime) / makespan) * anchoGrafico;

    // Fondo del bloque
    const color = coloresPID[idx % coloresPID.length];
    ctx.fillStyle = color;
    ctx.alpha = 0.9;
    ctx.fillRect(xInicio, y, anchobloque, alturaPorProceso);

    // Borde del bloque
    ctx.strokeStyle = "#042C53";
    ctx.lineWidth = 1;
    ctx.strokeRect(xInicio, y, anchobloque, alturaPorProceso);

    // Texto dentro del bloque
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 11px var(--font-mono)";
    ctx.textAlign = "center";
    ctx.fillText(
      `P${p.pid}`,
      xInicio + anchobloque / 2,
      y + alturaPorProceso / 2 + 3
    );

    // Tiempos en los extremos
    ctx.fillStyle = "#042C53";
    ctx.font = "9px var(--font-mono)";
    ctx.textAlign = "center";
    ctx.fillText(p.startTime, xInicio, y - 3);
    ctx.textAlign = "left";
    ctx.fillText(p.finishTime, xInicio + anchobloque + 2, y - 3);
  });

  // Actualizar timeline de abajo
  actualizarTimelineGantt(makespan);
}

/**
 * Actualiza los números de tiempo debajo del Gantt
 */
function actualizarTimelineGantt(makespan) {
  const timeline = document.getElementById("ganttTimeline");
  if (!timeline) return;

  timeline.innerHTML = "";

  const incremento = Math.ceil(makespan / 10);
  for (let t = 0; t <= makespan; t += incremento) {
    const span = document.createElement("span");
    span.textContent = t;
    timeline.appendChild(span);
  }
}

/* ----------------------------------------------------------
   5. ACTUALIZAR MÉTRICAS
   ---------------------------------------------------------- */

function actualizarMetricas() {
  if (!resultadoActual) return;

  const metricas = resultadoActual.metricas;
  const metricsList = document.getElementById("metricsList");

  if (!metricsList) return;

  metricsList.innerHTML = `
    <div class="metric-row">
      <span class="metric-label">Avg Waiting</span>
      <span class="metric-value">${metricas.avgWaiting ||
    0}ms</span>
    </div>
    <div class="metric-row">
      <span class="metric-label">Avg Turnaround</span>
      <span class="metric-value">${metricas.avgTurnaround ||
    0}ms</span>
    </div>
    <div class="metric-row">
      <span class="metric-label">Avg Response</span>
      <span class="metric-value">${metricas.avgResponse ||
    0}ms</span>
    </div>
    <div class="metric-row">
      <span class="metric-label">CPU Utilization</span>
      <span class="metric-value good">${metricas.cpuUtilization ||
    "0%"}</span>
    </div>
    <div class="metric-row">
      <span class="metric-label">Makespan</span>
      <span class="metric-value">${metricas.makespan || 0}ms</span>
    </div>
  `;
}

/* ----------------------------------------------------------
   6. ACTUALIZAR QUEUE DINÁMICA
   ---------------------------------------------------------- */

function actualizarQueueDinámica() {
  if (!resultadoActual) return;

  const procesos = resultadoActual.procesos;
  const queueItems = document.getElementById("queueItems");

  if (!queueItems) return;

  queueItems.innerHTML = "";

  // Mostrar en orden de finalización
  procesos.forEach((p) => {
    const item = document.createElement("div");
    item.className = "queue-item";
    item.textContent = `P${p.pid}`;
    queueItems.appendChild(item);
  });
}

/* ----------------------------------------------------------
   7. LIMPIAR GANTT
   ---------------------------------------------------------- */

function limpiarGantt() {
  const canvas = document.getElementById("ganttCanvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#F4F6F9";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  document.getElementById("metricsList").innerHTML = `
    <div class="metric-row">
      <span class="metric-label">Avg Waiting</span>
      <span class="metric-value">—</span>
    </div>
    <div class="metric-row">
      <span class="metric-label">Avg Turnaround</span>
      <span class="metric-value">—</span>
    </div>
    <div class="metric-row">
      <span class="metric-label">Avg Response</span>
      <span class="metric-value">—</span>
    </div>
    <div class="metric-row">
      <span class="metric-label">CPU Utilization</span>
      <span class="metric-value good">—</span>
    </div>
    <div class="metric-row">
      <span class="metric-label">Makespan</span>
      <span class="metric-value">—</span>
    </div>
  `;

  resultadoActual = null;
}

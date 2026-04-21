/* ============================================================
   OSim — Controlador UI para Scheduling
   Archivo: scheduling-ui.js
   ============================================================ */

let resultadoActual = null;
let algoritmoSeleccionado = "fcfs";

// Estado de la animación
let _animTimer  = null;
let _animTime   = 0;
let _animSegs   = [];
let _animSpan   = 0;

/* ----------------------------------------------------------
   1. INICIALIZACIÓN
   ---------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".algo-item").forEach((btn) => {
    btn.addEventListener("click", (e) => seleccionarAlgoritmo(e.currentTarget.dataset.algo));
  });

  document.getElementById("btnExecute")?.addEventListener("click", ejecutarSimulacion);
  document.getElementById("btnAnimate")?.addEventListener("click", toggleAnimacion);
  document.getElementById("btnReset")?.addEventListener("click", limpiarGantt);
  document.getElementById("fileInput")?.addEventListener("change", (e) => {
    if (e.target.files[0]) cargarDesdearchivo(e.target.files[0]);
  });
  document.getElementById("btnAddProcess")?.addEventListener("click", agregarProceso);
  document.getElementById("btnClearAll")?.addEventListener("click", limpiarTodos);
  document.getElementById("btnCancelEdit")?.addEventListener("click", cancelarEdicion);
});

/* ----------------------------------------------------------
   2. SELECCIONAR ALGORITMO
   ---------------------------------------------------------- */
function seleccionarAlgoritmo(algo) {
  algoritmoSeleccionado = algo;

  document.querySelectorAll(".algo-item").forEach((btn) => {
    btn.classList.remove("active", "algo-ring");
  });
  const btnActivo = document.querySelector(`[data-algo="${algo}"]`);
  if (btnActivo) {
    btnActivo.classList.add("active");
    void btnActivo.offsetWidth;
    btnActivo.classList.add("algo-ring");
  }

  // Mostrar/ocultar quantum (solo RR)
  document.getElementById("quantumControl").style.display = algo === "rr" ? "flex" : "none";

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

  // Detener animación previa si existe
  if (_animTimer !== null) detenerAnimacion(false);

  resultadoActual = ejecutarAlgoritmo(algoritmoSeleccionado, procesosGlobales, quantum);
  if (!resultadoActual) return;

  dibujarGantt();

  // Mostrar botón Animar
  const btnAnim = document.getElementById("btnAnimate");
  const timeLabel = document.getElementById("ganttTimeLabel");
  if (btnAnim) { btnAnim.style.display = ""; btnAnim.textContent = "▶ Animar"; btnAnim.classList.remove("playing"); }
  if (timeLabel) timeLabel.style.display = "none";
  actualizarMetricas();
  actualizarQueueDinámica();
  renderEstadosProcesos();

  localStorage.setItem("osim_scheduling", JSON.stringify({
    algoritmo:      resultadoActual.algoritmo,
    avgWaiting:     resultadoActual.metricas.avgWaiting,
    avgTurnaround:  resultadoActual.metricas.avgTurnaround,
    cpuUtilization: resultadoActual.metricas.cpuUtilization,
    makespan:       resultadoActual.metricas.makespan,
    totalProcesos:  resultadoActual.procesos.length,
  }));
}

/* ----------------------------------------------------------
   4. DIBUJAR GANTT EN HTML/CSS (sin Canvas)
   ---------------------------------------------------------- */
function dibujarGantt() {
  const ganttChart = document.getElementById("ganttChart");
  if (!ganttChart || !resultadoActual) return;

  const segments = resultadoActual.segments ||
    [...resultadoActual.procesos]
      .sort((a, b) => a.startTime - b.startTime)
      .map(p => ({ pid: p.pid, start: p.startTime, end: p.finishTime }));

  const makespan = resultadoActual.metricas.makespan;
  if (!segments.length || makespan === 0) { ganttChart.innerHTML = ""; return; }

  // PIDs únicos en orden de primera aparición
  const seenPids = [];
  segments.forEach(s => { if (!seenPids.includes(s.pid)) seenPids.push(s.pid); });

  const colores = ["#3d687b","#639922","#EF9F27","#E24B4A","#8B77D4","#1DB884","#FF6B6B","#4ECDC4"];
  const pidToIdx = {};
  seenPids.forEach((pid, i) => { pidToIdx[pid] = i; });

  // Posiciones x de cambios de contexto
  const csPositions = new Set();
  for (let i = 1; i < segments.length; i++) {
    if (segments[i].pid !== segments[i - 1].pid)
      csPositions.add(((segments[i].start / makespan) * 100).toFixed(3));
  }
  const csHTML = [...csPositions]
    .map(x => `<div class="gantt-cs" style="left:${x}%"></div>`)
    .join("");

  // Filas por PID
  const rowsHTML = seenPids.map(pid => {
    const idx   = pidToIdx[pid];
    const color = colores[idx % colores.length];

    const blocksHTML = segments
      .filter(s => s.pid === pid)
      .map((seg, i) => {
        const left  = ((seg.start / makespan) * 100).toFixed(3);
        const width = (((seg.end - seg.start) / makespan) * 100).toFixed(3);
        const label = parseFloat(width) > 4 ? `P${pid}` : "";
        return `<div class="gantt-block"
          style="left:${left}%;width:${width}%;background:${color};color:#fff;font-weight:700;font-size:11px;"
          title="P${pid}: t${seg.start} → t${seg.end}">${label}</div>`;
      }).join("");

    return `<div class="gantt-row">
      <div class="gantt-pid">P${pid}</div>
      <div class="gantt-track">${csHTML}${blocksHTML}</div>
    </div>`;
  }).join("");

  // Eje de tiempo (único, sin duplicado)
  const paso = Math.ceil(makespan / 10) || 1;
  const ticks = [];
  for (let t = 0; t <= makespan; t += paso) {
    const left = ((t / makespan) * 100).toFixed(3);
    ticks.push(`<span class="gantt-tick" style="position:absolute;left:${left}%;transform:translateX(-50%)">${t}</span>`);
  }
  const axisHTML = `<div class="gantt-row" style="margin-top:4px;">
    <div class="gantt-pid"></div>
    <div class="gantt-track" style="background:transparent;border:none;height:18px;position:relative;">${ticks.join("")}</div>
  </div>`;

  ganttChart.innerHTML = rowsHTML + axisHTML;
  ganttChart.classList.remove("gantt-loaded");
  void ganttChart.offsetWidth; // reflow para reiniciar animación
  ganttChart.classList.add("gantt-loaded");
}

/* ----------------------------------------------------------
   5. ACTUALIZAR MÉTRICAS — con animación count-up y pop
   ---------------------------------------------------------- */
function actualizarMetricas() {
  if (!resultadoActual) return;
  const m = resultadoActual.metricas;

  const datos = [
    { label: "Avg Waiting",      raw: m.avgWaiting,                         sufijo: "ms" },
    { label: "Avg Turnaround",   raw: m.avgTurnaround,                      sufijo: "ms" },
    { label: "Avg Response",     raw: m.avgResponse,                        sufijo: "ms" },
    { label: "CPU Utilization",  raw: m.cpuUtilization,                     sufijo: "", clase: "good" },
    { label: "Makespan",         raw: m.makespan,                           sufijo: "ms" },
    { label: "Context Switches", raw: resultadoActual.contextSwitches ?? 0, sufijo: "" },
  ];

  const lista = document.getElementById("metricsList");
  if (!lista) return;

  lista.innerHTML = datos.map((d, i) => `
    <div class="metric-row metric-pop" style="animation-delay:${i * 55}ms; opacity:0">
      <span class="metric-label">${d.label}</span>
      <span class="metric-value ${d.clase || ""}" data-target="${d.raw}" data-sufijo="${d.sufijo}">0${d.sufijo}</span>
    </div>`).join("");

  lista.querySelectorAll(".metric-value[data-target]").forEach((el) => {
    const destino = parseFloat(el.dataset.target) || 0;
    const sufijo  = el.dataset.sufijo;
    const esPct   = String(el.dataset.target).includes("%");
    const textoFin = esPct ? String(el.dataset.target) : null;

    if (esPct) { setTimeout(() => { el.textContent = textoFin; }, 650); return; }

    const dur   = 650;
    const start = performance.now();
    function tick(ahora) {
      const t    = Math.min((ahora - start) / dur, 1);
      const ease = 1 - Math.pow(1 - t, 2);
      const val  = destino * ease;
      el.textContent = (Number.isInteger(destino) ? Math.round(val) : val.toFixed(2)) + sufijo;
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

/* ----------------------------------------------------------
   6. ACTUALIZAR QUEUE DINÁMICA
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
    if (i === 0) item.classList.add("running");
    queueItems.appendChild(item);
  });
}

/* ----------------------------------------------------------
   7. RENDERIZAR ESTADOS DE PROCESOS
   ---------------------------------------------------------- */
function renderEstadosProcesos() {
  if (!resultadoActual) return;
  const statesPanel = document.getElementById("statesPanel");
  const grid        = document.getElementById("processStateGrid");
  if (!statesPanel || !grid) return;

  statesPanel.style.display = "block";

  // Marcar todos los procesos ejecutados como Terminated
  resultadoActual.procesos.forEach(p => {
    const orig = procesosGlobales.find(x => x.pid === p.pid);
    if (orig) orig.state = "terminated";
  });

  const cardsHTML = resultadoActual.procesos
    .sort((a, b) => a.pid - b.pid)
    .map(p => `
      <div class="psc-card">
        <div class="psc-pid">P${p.pid}</div>
        ${badgeEstado("terminated")}
        <div class="psc-metrics">
          <span class="psc-metric">WT <strong>${p.waitingTime}</strong></span>
          <span class="psc-metric">TAT <strong>${p.turnaroundTime}</strong></span>
          <span class="psc-metric">RT <strong>${p.responseTime}</strong></span>
        </div>
      </div>`).join("");

  grid.innerHTML = cardsHTML;

  // Refrescar tabla para mostrar badge Terminated
  if (typeof renderizarTablaProcesos === "function") renderizarTablaProcesos();
}

/* ----------------------------------------------------------
   9. ANIMACIÓN GANTT PASO A PASO — 1 unidad de burst = 1.5 s
   ---------------------------------------------------------- */

function toggleAnimacion() {
  if (_animTimer !== null) {
    detenerAnimacion(false);
  } else {
    iniciarAnimacion();
  }
}

function iniciarAnimacion() {
  if (!resultadoActual) return;

  _animSegs = resultadoActual.segments ||
    [...resultadoActual.procesos]
      .sort((a, b) => a.startTime - b.startTime)
      .map(p => ({ pid: p.pid, start: p.startTime, end: p.finishTime }));
  _animSpan = resultadoActual.metricas.makespan;
  _animTime = 0;

  // Redibujar gantt limpio como base
  dibujarGantt();

  // Agregar cover + cursor por cada track
  document.querySelectorAll('#ganttChart .gantt-track').forEach(tr => {
    tr.style.overflow = 'hidden';

    const cover = document.createElement('div');
    cover.className = 'gantt-anim-cover';
    tr.appendChild(cover);

    const cursor = document.createElement('div');
    cursor.className = 'gantt-anim-cursor';
    tr.appendChild(cursor);
  });

  // Mostrar badge de tiempo
  const timeLabel = document.getElementById('ganttTimeLabel');
  if (timeLabel) { timeLabel.style.display = ''; timeLabel.textContent = 't = 0'; }

  // Botón en modo stop
  const btn = document.getElementById('btnAnimate');
  if (btn) { btn.textContent = '⏹ Detener'; btn.classList.add('playing'); }

  // Primer tick inmediato
  _pasoAnimacion();
  _animTimer = setInterval(_pasoAnimacion, 1500);
}

function _pasoAnimacion() {
  const pct = (_animTime / _animSpan * 100).toFixed(3);

  // Desplazar covers: revelan lo ya ejecutado moviéndose hacia la derecha
  document.querySelectorAll('#ganttChart .gantt-anim-cover').forEach(c => {
    c.style.left = `${pct}%`;
  });
  document.querySelectorAll('#ganttChart .gantt-anim-cursor').forEach(c => {
    c.style.left = `${pct}%`;
  });

  // Badge de tiempo
  const timeLabel = document.getElementById('ganttTimeLabel');
  if (timeLabel) timeLabel.textContent = `t = ${_animTime}`;

  // Diagrama de estados y cards
  _actualizarEstadosAnimacion(_animTime);

  _animTime++;
  if (_animTime > _animSpan) {
    detenerAnimacion(true);
  }
}

function detenerAnimacion(completado) {
  if (_animTimer) { clearInterval(_animTimer); _animTimer = null; }

  const btn = document.getElementById('btnAnimate');
  if (btn) { btn.textContent = '▶ Animar'; btn.classList.remove('playing'); }

  limpiarActivosEstado();

  if (!completado) {
    // Restaurar gantt completo sin covers
    dibujarGantt();
    const timeLabel = document.getElementById('ganttTimeLabel');
    if (timeLabel) timeLabel.style.display = 'none';
  }
}

function _actualizarEstadosAnimacion(t) {
  limpiarActivosEstado();
  if (!resultadoActual) return;

  // Proceso en ejecución en [t-1, t)
  const runSeg   = _animSegs.find(s => s.start < t && t <= s.end);
  const runPid   = runSeg ? runSeg.pid : null;

  const procesos = resultadoActual.procesos;

  // Procesos llegados pero aún no terminados y no corriendo → Ready
  const hayReady = procesos.some(p =>
    p.arrivalTime < t && p.finishTime > t && p.pid !== runPid
  );

  // Algún proceso ya terminó
  const hayTerminated = procesos.some(p => p.finishTime <= t);

  if (runPid !== null) document.getElementById('smdRunning')?.classList.add('smd-active');
  if (hayReady)        document.getElementById('smdReady')?.classList.add('smd-active');
  if (hayTerminated)   document.getElementById('smdTerminated')?.classList.add('smd-active');

  // Actualizar borde de cards de proceso según su estado actual
  const grid = document.getElementById('processStateGrid');
  if (!grid) return;
  procesos.forEach(p => {
    const card = [...grid.querySelectorAll('.psc-card')].find(c =>
      c.querySelector('.psc-pid')?.textContent === `P${p.pid}`
    );
    if (!card) return;

    let borderColor;
    if (p.finishTime <= t)       borderColor = '#bbb';
    else if (p.pid === runPid)   borderColor = 'var(--color-running)';
    else if (p.arrivalTime < t)  borderColor = 'var(--color-blue-500)';
    else                         borderColor = 'var(--border)';

    card.style.borderColor  = borderColor;
    card.style.borderWidth  = p.pid === runPid ? '2px' : '';
    card.style.transition   = 'border-color 0.3s ease';
  });
}

function limpiarActivosEstado() {
  ['smdNew','smdReady','smdRunning','smdWaiting','smdTerminated'].forEach(id => {
    document.getElementById(id)?.classList.remove('smd-active');
  });
  // Resetear bordes de cards
  document.querySelectorAll('#processStateGrid .psc-card').forEach(c => {
    c.style.borderColor = '';
    c.style.borderWidth = '';
  });
}

/* ----------------------------------------------------------
   10. LIMPIAR GANTT
   ---------------------------------------------------------- */
function limpiarGantt() {
  if (_animTimer !== null) detenerAnimacion(false);

  const btnAnim  = document.getElementById("btnAnimate");
  const timeLabel = document.getElementById("ganttTimeLabel");
  if (btnAnim)   { btnAnim.style.display = "none"; }
  if (timeLabel) { timeLabel.style.display = "none"; }

  const ganttChart = document.getElementById("ganttChart");
  if (ganttChart) ganttChart.innerHTML = "";

  document.getElementById("metricsList").innerHTML = `
    <div class="metric-row"><span class="metric-label">Avg Waiting</span><span class="metric-value">—</span></div>
    <div class="metric-row"><span class="metric-label">Avg Turnaround</span><span class="metric-value">—</span></div>
    <div class="metric-row"><span class="metric-label">Avg Response</span><span class="metric-value">—</span></div>
    <div class="metric-row"><span class="metric-label">CPU Utilization</span><span class="metric-value good">—</span></div>
    <div class="metric-row"><span class="metric-label">Makespan</span><span class="metric-value">—</span></div>
    <div class="metric-row"><span class="metric-label">Context Switches</span><span class="metric-value">—</span></div>
  `;

  const statesPanel = document.getElementById("statesPanel");
  if (statesPanel) statesPanel.style.display = "none";

  resultadoActual = null;
}

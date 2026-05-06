/* ============================================================
   OSim — Controlador UI para Scheduling
   Archivo: scheduling-ui.js
   ============================================================ */

let resultadoActual = null;
let algoritmoSeleccionado = "fcfs";

// Colores del Gantt compartidos con animación y cards
const _GANTT_COLORS = ["#3d687b", "#639922", "#EF9F27", "#E24B4A", "#8B77D4", "#1DB884", "#FF6B6B", "#4ECDC4"];
let _pidColors = {}; // pid → color hex

// Estado de la animación
let _animTimer = null;
let _animTime = 0;
let _animSegs = [];
let _animSpan = 0;
// Referencias DOM cacheadas para la animación (evitan querySelector en cada tick)
let _animCards = {}; // pid → .psc-card element
let _animTdCells = {}; // pid → <td> de estado en tabla

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

  // Mostrar/ocultar quantum de cada cola cuando cambia el algoritmo seleccionado
  ["mlq", "mlfq"].forEach(prefix => {
    [0, 1, 2].forEach(i => {
      const sel = document.getElementById(`${prefix}AlgoQ${i}`);
      const qRow = document.getElementById(`${prefix}QuantumQ${i}Row`);
      if (sel && qRow) {
        sel.addEventListener("change", () => {
          qRow.style.display = sel.value === "rr" ? "flex" : "none";
        });
      }
    });
  });
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

  // Mostrar/ocultar controles según el algoritmo
  document.getElementById("quantumControl").style.display = algo === "rr" ? "flex" : "none";
  document.getElementById("mlqConfig").style.display = algo === "mlq" ? "block" : "none";
  document.getElementById("mlfqConfig").style.display = algo === "mlfq" ? "block" : "none";

  // Actualizar título del Gantt
  const nombres = {
    fcfs: "FCFS — First Come First Served",
    sjf: "SJF — Shortest Job First",
    hrrn: "HRRN — Highest Response Ratio Next",
    rr: "Round Robin",
    srtf: "SRTF — Shortest Remaining Time",
    priority: "Priority (Preemptive)",
    mlq: "Multilevel Queue",
    mlfq: "Multilevel Feedback Queue",
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

  // Leer configuración de colas para MLQ / MLFQ
  function leerConfigColas(prefix) {
    return [0, 1, 2].map(i => {
      const algo = document.getElementById(`${prefix}AlgoQ${i}`)?.value || "fcfs";
      const q = parseInt(document.getElementById(`${prefix}QuantumQ${i}`)?.value) || 2;
      return { algo, quantum: algo === "rr" ? q : undefined };
    });
  }
  const mlqConfigs  = algoritmoSeleccionado === "mlq"  ? leerConfigColas("mlq")  : null;
  const mlfqConfigs = algoritmoSeleccionado === "mlfq" ? leerConfigColas("mlfq") : null;
  const numCores = parseInt(document.getElementById("coresValue")?.value) || 1;

  // Detener animación previa si existe
  if (_animTimer !== null) detenerAnimacion(false);

  resultadoActual = ejecutarAlgoritmo(algoritmoSeleccionado, procesosGlobales, quantum, mlqConfigs, mlfqConfigs, numCores);
  if (!resultadoActual) return;

  /* ── Guardar prueba en Store para Métricas ── */
  if (typeof Store !== 'undefined') {
    Store.saveScheduling(algoritmoSeleccionado, procesosGlobales, quantum);
  }

  dibujarGantt();
  dibujarGanttCores();

  // Mostrar botón Animar
  const btnAnim = document.getElementById("btnAnimate");
  const timeLabel = document.getElementById("ganttTimeLabel");
  if (btnAnim) { btnAnim.style.display = ""; btnAnim.textContent = "▶ Animar"; btnAnim.classList.remove("playing"); }
  if (timeLabel) timeLabel.style.display = "none";
  actualizarMetricas();
  actualizarQueueDinámica();
  renderEstadosProcesos();

  localStorage.setItem("osim_scheduling", JSON.stringify({
    algoritmo: resultadoActual.algoritmo,
    avgWaiting: resultadoActual.metricas.avgWaiting,
    avgTurnaround: resultadoActual.metricas.avgTurnaround,
    cpuUtilization: resultadoActual.metricas.cpuUtilization,
    makespan: resultadoActual.metricas.makespan,
    totalProcesos: resultadoActual.procesos.length,
  }));

  /* ── Notificar al servidor (fork de scheduling) ── */
  if (window.OSimClient?.isConnected()) {
    const n = resultadoActual.procesos.length;
    window.OSimClient.notificarInicio(resultadoActual.algoritmo, n, 1)
      .then(() => window.OSimClient.notificarFin(
        Math.round(resultadoActual.metricas.makespan ?? 0),
        n
      ));
  }
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

  const colores = _GANTT_COLORS;
  const pidToIdx = {};
  seenPids.forEach((pid, i) => { pidToIdx[pid] = i; });

  // Poblar mapa global de colores por PID
  _pidColors = {};
  seenPids.forEach((pid, i) => { _pidColors[pid] = colores[i % colores.length]; });

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
    const idx = pidToIdx[pid];
    const color = colores[idx % colores.length];
    const orig = procesosGlobales.find(p => p.pid === pid);
    const prefix = orig?.type === "thread" ? "T" : "P";
    // Threads: borde punteado para distinguir visualmente
    const trackStyle = orig?.type === "thread"
      ? "border:1.5px dashed rgba(74,20,140,0.35);border-radius:4px;"
      : "";

    const blocksHTML = segments
      .filter(s => s.pid === pid)
      .map((seg) => {
        const left = ((seg.start / makespan) * 100).toFixed(3);
        const width = (((seg.end - seg.start) / makespan) * 100).toFixed(3);
        const label = parseFloat(width) > 4 ? `${prefix}${pid}` : "";
        return `<div class="gantt-block"
          style="left:${left}%;width:${width}%;background:${color};color:#fff;font-weight:700;font-size:11px;"
          title="${prefix}${pid}: t${seg.start} → t${seg.end}">${label}</div>`;
      }).join("");

    return `<div class="gantt-row">
      <div class="gantt-pid">${prefix}${pid}</div>
      <div class="gantt-track" style="${trackStyle}">${csHTML}${blocksHTML}</div>
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
    { label: "Avg Waiting", raw: m.avgWaiting, sufijo: "ms" },
    { label: "Avg Turnaround", raw: m.avgTurnaround, sufijo: "ms" },
    { label: "Avg Response", raw: m.avgResponse, sufijo: "ms" },
    { label: "CPU Utilization", raw: m.cpuUtilization, sufijo: "", clase: "good" },
    { label: "Makespan", raw: m.makespan, sufijo: "ms" },
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
    const sufijo = el.dataset.sufijo;
    const esPct = String(el.dataset.target).includes("%");
    const textoFin = esPct ? String(el.dataset.target) : null;

    if (esPct) { setTimeout(() => { el.textContent = textoFin; }, 650); return; }

    const dur = 650;
    const start = performance.now();
    function tick(ahora) {
      const t = Math.min((ahora - start) / dur, 1);
      const ease = 1 - Math.pow(1 - t, 2);
      const val = destino * ease;
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
    const orig = procesosGlobales.find(x => x.pid === p.pid);
    const prefix = orig?.type === "thread" ? "T" : "P";
    const item = document.createElement("div");
    item.className = "queue-item queue-enter";
    item.style.animationDelay = `${i * 60}ms`;
    item.style.opacity = "0";
    item.textContent = `${prefix}${p.pid}`;
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
  const grid = document.getElementById("processStateGrid");
  if (!statesPanel || !grid) return;

  statesPanel.style.display = "block";

  // Estado inicial: "new" — la animación irá cambiándolos
  resultadoActual.procesos.forEach(p => {
    const orig = procesosGlobales.find(x => x.pid === p.pid);
    if (orig) orig.state = "new";
  });

  const cardsHTML = resultadoActual.procesos
    .sort((a, b) => a.pid - b.pid)
    .map(p => {
      const color = _pidColors[p.pid] || "#888";
      const orig = procesosGlobales.find(x => x.pid === p.pid);
      const tipo = orig?.type || "fork";
      const prefix = tipo === "thread" ? "T" : "P";
      const memNote = tipo === "thread"
        ? `<span style="font-size:10px;color:#4A148C;background:#EDE7F6;border-radius:4px;padding:1px 5px;">Comparte memoria</span>`
        : `<span style="font-size:10px;color:#BF360C;background:#FFF3E0;border-radius:4px;padding:1px 5px;">Memoria privada</span>`;
      return `
      <div class="psc-card" data-pid="${p.pid}">
        <div class="psc-pid" style="display:flex;align-items:center;gap:6px;">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0;"></span>
          ${prefix}${p.pid}
          ${badgeTipo(tipo)}
        </div>
        <div class="psc-state-badge">${badgeEstado("new")}</div>
        <div class="psc-metrics">
          <span class="psc-metric">WT <strong>${p.waitingTime}</strong></span>
          <span class="psc-metric">TAT <strong>${p.turnaroundTime}</strong></span>
          <span class="psc-metric">RT <strong>${p.responseTime}</strong></span>
        </div>
        <div>${memNote}</div>
      </div>`;
    }).join("");

  grid.innerHTML = cardsHTML;

  // Refrescar tabla con estado "new"
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

  // Redibujar gantt y asegurarse que el panel de estados es visible
  dibujarGantt();
  const statesPanel = document.getElementById('statesPanel');
  if (statesPanel) statesPanel.style.display = 'block';

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

  // ─── Cachear referencias DOM ───────────────────────────────
  _animCards = {};
  _animTdCells = {};

  // Cards: buscar por data-pid en el grid
  document.querySelectorAll('#processStateGrid .psc-card').forEach(card => {
    const pid = parseInt(card.getAttribute('data-pid'));
    if (!isNaN(pid)) _animCards[pid] = card;
  });

  // Celdas de estado en la tabla (columna 6, índice 5)
  document.querySelectorAll('#processTableBody tr').forEach(row => {
    const tds = row.querySelectorAll('td');
    if (tds.length >= 6) {
      const pid = parseInt(tds[0].textContent.trim());
      if (!isNaN(pid)) _animTdCells[pid] = tds[5];
    }
  });

  // Resetear todos los badges a "new" explícitamente
  resultadoActual.procesos.forEach(p => {
    const card = _animCards[p.pid];
    if (card) {
      const badge = card.querySelector('.psc-state-badge');
      if (badge) badge.innerHTML = badgeEstado('new');
      card.style.borderColor = '';
      card.style.borderWidth = '';
    }
    const td = _animTdCells[p.pid];
    if (td) td.innerHTML = badgeEstado('new');

    const orig = procesosGlobales.find(x => x.pid === p.pid);
    if (orig) orig.state = 'new';
  });

  // Mostrar badge de tiempo
  const timeLabel = document.getElementById('ganttTimeLabel');
  if (timeLabel) { timeLabel.style.display = ''; timeLabel.textContent = 't = 0'; }

  // Botón en modo stop
  const btn = document.getElementById('btnAnimate');
  if (btn) { btn.textContent = '⏹ Detener'; btn.classList.add('playing'); }

  // Primer tick inmediato, luego cada 1.5 s
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

  const estadoFinal = completado ? 'terminated' : 'new';

  if (resultadoActual) {
    resultadoActual.procesos.forEach(p => {
      const orig = procesosGlobales.find(x => x.pid === p.pid);
      if (orig) orig.state = estadoFinal;

      // Card — usar mapa cacheado primero, fallback a querySelector
      const card = _animCards[p.pid] ||
        document.querySelector(`#processStateGrid .psc-card[data-pid="${p.pid}"]`);
      if (card) {
        const badge = card.querySelector('.psc-state-badge');
        if (badge) badge.innerHTML = badgeEstado(estadoFinal);
        card.style.borderColor = '';
        card.style.borderWidth = '';
      }

      // Celda tabla — usar mapa cacheado primero, fallback a búsqueda
      const td = _animTdCells[p.pid] || (() => {
        let found = null;
        document.querySelectorAll('#processTableBody tr').forEach(row => {
          const tds = row.querySelectorAll('td');
          if (tds.length >= 6 && parseInt(tds[0].textContent.trim()) === p.pid) found = tds[5];
        });
        return found;
      })();
      if (td) td.innerHTML = badgeEstado(estadoFinal);
    });
  }

  if (!completado) {
    dibujarGantt();
    const timeLabel = document.getElementById('ganttTimeLabel');
    if (timeLabel) timeLabel.style.display = 'none';
  }
}

function _estadoEnTiempo(p, t, runPid) {
  if (p.finishTime <= t) return "terminated";
  if (p.pid === runPid) return "running";
  if (p.arrivalTime < t) return "ready";
  return "new";
}

function _actualizarEstadosAnimacion(t) {
  limpiarActivosEstado();
  if (!resultadoActual) return;

  // Proceso en ejecución durante (t-1, t]
  const runSeg = _animSegs.find(s => s.start < t && t <= s.end);
  const runPid = runSeg ? runSeg.pid : null;

  const procesos = resultadoActual.procesos;

  // Iluminar nodos del diagrama de estados
  const hayNew = procesos.some(p => p.arrivalTime >= t);
  const hayReady = procesos.some(p => p.arrivalTime < t && p.finishTime > t && p.pid !== runPid);
  const hayTerminated = procesos.some(p => p.finishTime <= t);

  if (hayNew) document.getElementById('smdNew')?.classList.add('smd-active');
  if (hayReady) document.getElementById('smdReady')?.classList.add('smd-active');
  if (runPid !== null) document.getElementById('smdRunning')?.classList.add('smd-active');
  if (hayTerminated) document.getElementById('smdTerminated')?.classList.add('smd-active');

  // Colores de borde para cada estado
  const borderColors = {
    running: '#6aaa1a',
    ready: '#185fa5',
    terminated: '#bbb',
    new: '',
  };

  // Actualizar cada proceso usando referencias cacheadas
  procesos.forEach(p => {
    const estado = _estadoEnTiempo(p, t, runPid);

    // Actualizar estado en procesosGlobales
    const orig = procesosGlobales.find(x => x.pid === p.pid);
    if (orig) orig.state = estado;

    // — Card en Diagrama de Estados —
    const card = _animCards[p.pid]
      ?? document.querySelector('#processStateGrid [data-pid="' + p.pid + '"]');
    if (card) {
      const badge = card.querySelector('.psc-state-badge');
      if (badge) badge.innerHTML = badgeEstado(estado);
      card.style.borderColor = borderColors[estado] ?? '';
      card.style.borderWidth = estado === 'running' ? '2px' : '1px';
    }

    // — Celda Estado en tabla de Procesos Cargados —
    const td = _animTdCells[p.pid] ?? (() => {
      let found = null;
      document.querySelectorAll('#processTableBody tr').forEach(row => {
        const tds = row.querySelectorAll('td');
        if (tds.length >= 6 && parseInt(tds[0].textContent.trim()) === p.pid) found = tds[5];
      });
      return found;
    })();
    if (td) td.innerHTML = badgeEstado(estado);
  });
}

function limpiarActivosEstado() {
  ['smdNew', 'smdReady', 'smdRunning', 'smdWaiting', 'smdTerminated'].forEach(id => {
    document.getElementById(id)?.classList.remove('smd-active');
  });
}

/* ----------------------------------------------------------
   10. DIBUJAR GANTT POR CORES (multi-core view)
   ---------------------------------------------------------- */
function dibujarGanttCores() {
  const panel = document.getElementById("coreViewPanel");
  const chart = document.getElementById("coreGanttChart");
  if (!panel || !chart || !resultadoActual) return;

  const numCores = resultadoActual.numCores || 1;
  if (numCores <= 1) { panel.style.display = "none"; return; }

  const segments = resultadoActual.segments || [];
  const makespan = resultadoActual.metricas.makespan;
  if (!segments.length || makespan === 0) { panel.style.display = "none"; return; }

  panel.style.display = "";
  document.getElementById("coreViewTitle").textContent =
    `Vista por Cores — ${numCores} core${numCores > 1 ? "s" : ""} en paralelo`;

  const paso = Math.ceil(makespan / 10) || 1;
  const ticks = [];
  for (let t = 0; t <= makespan; t += paso) {
    const left = ((t / makespan) * 100).toFixed(2);
    ticks.push(`<span class="gantt-tick" style="position:absolute;left:${left}%;transform:translateX(-50%)">${t}</span>`);
  }
  const axisHTML = `<div class="gantt-row" style="margin-top:4px;">
    <div class="gantt-pid" style="min-width:52px;"></div>
    <div class="gantt-track" style="background:transparent;border:none;height:18px;position:relative;">${ticks.join("")}</div>
  </div>`;

  const rowsHTML = Array.from({ length: numCores }, (_, coreId) => {
    const coreSegs = segments.filter(s => (s.core ?? 0) === coreId);

    const blocksHTML = coreSegs.map(seg => {
      const pid   = seg.pid;
      const color = _pidColors[pid] || "#3d687b";
      const left  = ((seg.start / makespan) * 100).toFixed(2);
      const width = (((seg.end - seg.start) / makespan) * 100).toFixed(2);
      const orig  = procesosGlobales.find(p => p.pid === pid);
      const prefix = orig?.type === "thread" ? "T" : "P";
      const label = parseFloat(width) > 4 ? `${prefix}${pid}` : "";
      return `<div class="gantt-block"
        style="left:${left}%;width:${width}%;background:${color};color:#fff;font-weight:700;font-size:11px;"
        title="${prefix}${pid}: t${seg.start}→t${seg.end}">${label}</div>`;
    }).join("");

    const idlePct = coreSegs.length
      ? (100 - coreSegs.reduce((s, seg) => s + (seg.end - seg.start) / makespan * 100, 0)).toFixed(1)
      : "100.0";

    return `<div class="gantt-row">
      <div class="gantt-pid" style="min-width:52px;font-size:11px;">Core ${coreId}${parseFloat(idlePct) > 0 ? `<br><span style="color:var(--text-muted);font-size:9px;">${idlePct}% idle</span>` : ""}</div>
      <div class="gantt-track" style="background:repeating-linear-gradient(90deg,rgba(0,0,0,0.04) 0px,rgba(0,0,0,0.04) 1px,transparent 1px,transparent 20px);">${blocksHTML}</div>
    </div>`;
  }).join("");

  chart.innerHTML = rowsHTML + axisHTML;
}

/* ----------------------------------------------------------
   11. LIMPIAR GANTT
   ---------------------------------------------------------- */
function limpiarGantt() {
  if (_animTimer !== null) detenerAnimacion(false);

  const btnAnim = document.getElementById("btnAnimate");
  const timeLabel = document.getElementById("ganttTimeLabel");
  if (btnAnim) { btnAnim.style.display = "none"; }
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

  const coreViewPanel = document.getElementById("coreViewPanel");
  if (coreViewPanel) coreViewPanel.style.display = "none";

  resultadoActual = null;
}
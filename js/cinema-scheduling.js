/* ============================================================
   OSim — La Taquilla del Cine (Cinema Scheduling Simulator)
   Archivo: cinema-scheduling.js
   ============================================================ */

const CS = {
  tick: 0,
  numCores: 1,
  processes: [],
  arriving: [],
  readyQueue: [],
  cores: [],        // [{pid, remainingTime, quantumUsed, queueIdx}|null] length = numCores
  done: [],
  ganttByCore: [],  // [coreIdx] => [{pid, color, newSeg}] one entry per tick
  quantumMax: 2,
  interval: null,
  speed: 700,
  algorithm: 'fcfs',
  paused: true,

  // MLQ / MLFQ
  queues: [[], [], []],   // queue[0]=alta, [1]=media, [2]=baja
  queueLevels: {},        // MLFQ: pid → current queue level
  mlqQuantums: [2, 4, Infinity],

  // compat getter: first running slot
  get running() { return this.cores.find(s => s !== null) ?? null; },
};

const COLORS = [
  '#3d687b', '#639922', '#EF9F27', '#E24B4A',
  '#8B77D4', '#1DB884', '#e06c75', '#61AFEF',
  '#c678dd', '#56b6c2',
];

/* ----------------------------------------------------------
   INICIALIZAR
   ---------------------------------------------------------- */
function initCinemaScheduling() {
  const panel = document.getElementById('cs-panel');
  if (panel) panel.style.display = 'block';

  const procs = (typeof procesosGlobales !== 'undefined') ? procesosGlobales : [];
  if (!procs.length) {
    mostrarToastCS('Agrega procesos primero.', 'error');
    return;
  }

  resetCinema(false);

  CS.numCores = Math.max(1, parseInt(document.getElementById('coresValue')?.value) || 1);
  CS.cores = new Array(CS.numCores).fill(null);
  CS.ganttByCore = Array.from({ length: CS.numCores }, () => []);

  CS.processes = procs.map((p, i) => ({
    pid: p.pid,
    arrivalTime: p.arrivalTime ?? 0,
    burstTime: p.burstTime ?? 1,
    priority: p.priority ?? 1,
    remainingTime: p.burstTime ?? 1,
    color: COLORS[i % COLORS.length],
    startTime: null,
    finishTime: null,
    turnaroundTime: null,
    waitingTime: null,
    quantumUsed: 0,
  }));

  CS.arriving = [...CS.processes].sort((a, b) => a.arrivalTime - b.arrivalTime);
  CS.readyQueue = [];
  CS.done = [];
  CS.tick = 0;
  CS.paused = true;
  CS.algorithm = (typeof algoritmoSeleccionado !== 'undefined' ? algoritmoSeleccionado : null) || 'fcfs';
  CS.quantumMax = parseInt(document.getElementById('quantumValue')?.value) || 2;

  // MLQ / MLFQ init
  CS.queues = [[], [], []];
  CS.queueLevels = {};
  if (CS.algorithm === 'mlq') {
    const q0 = parseInt(document.getElementById('mlqQuantumQ0')?.value) || 2;
    const q1 = parseInt(document.getElementById('mlqQuantumQ1')?.value) || 4;
    CS.mlqQuantums = [q0, q1, Infinity];
  } else if (CS.algorithm === 'mlfq') {
    const q0 = parseInt(document.getElementById('mlfqQuantumQ0')?.value) || 2;
    const q1 = parseInt(document.getElementById('mlfqQuantumQ1')?.value) || 4;
    CS.mlqQuantums = [q0, q1, Infinity];
    CS.processes.forEach(p => { CS.queueLevels[p.pid] = 0; });
  }

  _processArrivals(0);
  _dispatchFreeCores(0);

  renderCS();
  updateCSControls();
  mostrarToastCS(`Simulación lista · ${CS.algorithm.toUpperCase()} · ${CS.processes.length} proc · ${CS.numCores} core${CS.numCores > 1 ? 's' : ''}`, 'info');
}

/* ----------------------------------------------------------
   RESET
   ---------------------------------------------------------- */
function resetCinema(rerenderOnly = false) {
  clearInterval(CS.interval);
  CS.interval = null;
  CS.paused = true;
  if (!rerenderOnly) {
    CS.tick = 0; CS.readyQueue = [];
    CS.cores = new Array(CS.numCores || 1).fill(null);
    CS.done = [];
    CS.ganttByCore = Array.from({ length: CS.numCores || 1 }, () => []);
    CS.arriving = []; CS.processes = [];
    CS.queues = [[], [], []];
    CS.queueLevels = {};
  }
  renderCS();
  updateCSControls();
}

/* ----------------------------------------------------------
   PLAY / PAUSE
   ---------------------------------------------------------- */
function toggleCinemaPlay() {
  if (CS.paused) {
    if (CS.done.length === CS.processes.length && CS.processes.length > 0) {
      initCinemaScheduling();
      setTimeout(() => { CS.paused = false; startCinemaInterval(); updateCSControls(); }, 100);
      return;
    }
    CS.paused = false;
    startCinemaInterval();
  } else {
    CS.paused = true;
    clearInterval(CS.interval);
    CS.interval = null;
  }
  updateCSControls();
}

function startCinemaInterval() {
  clearInterval(CS.interval);
  CS.interval = setInterval(() => {
    const finished = tickCinema();
    if (finished) {
      clearInterval(CS.interval);
      CS.interval = null;
      CS.paused = true;
      updateCSControls();
      mostrarToastCS('¡Simulación completada!', 'success');
    }
  }, CS.speed);
}

function stepCinema() {
  if (CS.paused) tickCinema();
}

/* ----------------------------------------------------------
   HELPER: procesar llegadas hasta tick t
   ---------------------------------------------------------- */
function _processArrivals(t) {
  while (CS.arriving.length && CS.arriving[0].arrivalTime <= t) {
    const p = CS.arriving.shift();
    if (CS.algorithm === 'mlq') {
      const lvl = p.priority <= 1 ? 0 : p.priority <= 2 ? 1 : 2;
      CS.queues[lvl].push(p.pid);
    } else if (CS.algorithm === 'mlfq') {
      CS.queues[0].push(p.pid);
      CS.queueLevels[p.pid] = 0;
    } else {
      CS.readyQueue.push(p.pid);
    }
    animateArrival(p.pid);
  }
}

/* Helper: first non-empty queue index for MLQ/MLFQ */
function _highestQueue() {
  for (let i = 0; i < 3; i++) { if (CS.queues[i].length) return i; }
  return -1;
}

/* Helper: quantum limit for a core slot in MLQ/MLFQ */
function _mlqQuantumLimit(slot) {
  return CS.mlqQuantums[slot.queueIdx ?? 0] ?? Infinity;
}

/* ----------------------------------------------------------
   HELPER: despachar procesos a cores libres
   ---------------------------------------------------------- */
function _dispatchFreeCores(t) {
  const isML = CS.algorithm === 'mlq' || CS.algorithm === 'mlfq';
  if (!isML) sortQueueForAlgo(t);
  for (let ci = 0; ci < CS.numCores; ci++) {
    const hasWork = isML ? _highestQueue() !== -1 : CS.readyQueue.length > 0;
    if (!CS.cores[ci] && hasWork) {
      dispatchToCore(ci);
    }
  }
}

/* ----------------------------------------------------------
   TICK
   ---------------------------------------------------------- */
function tickCinema() {
  const t = CS.tick;

  // 1. Llegadas
  _processArrivals(t);

  // 2. SRTF: preempt cores si hay proceso más corto esperando
  if (CS.algorithm === 'srtf' && CS.readyQueue.length) {
    for (let ci = 0; ci < CS.numCores; ci++) {
      const slot = CS.cores[ci];
      if (!slot) continue;
      const shortest = shortestInQueue();
      const sp = getProc(shortest);
      const rp = getProc(slot.pid);
      if (sp && rp && sp.remainingTime < rp.remainingTime) {
        CS.readyQueue.push(slot.pid);
        animatePreempt(slot.pid);
        CS.cores[ci] = null;
        sortQueueForAlgo(t);
      }
    }
  }

  // 2b. MLQ/MLFQ: preempt if a higher-priority queue now has processes
  if (CS.algorithm === 'mlq' || CS.algorithm === 'mlfq') {
    const topQ = _highestQueue();
    if (topQ !== -1) {
      for (let ci = 0; ci < CS.numCores; ci++) {
        const slot = CS.cores[ci];
        if (!slot) continue;
        const slotQ = slot.queueIdx ?? 0;
        if (topQ < slotQ) {
          CS.queues[slotQ].unshift(slot.pid);
          animatePreempt(slot.pid);
          CS.cores[ci] = null;
        }
      }
    }
  }

  // 3. Despachar a cores libres
  _dispatchFreeCores(t);

  // 4. Ejecutar cada core
  for (let ci = 0; ci < CS.numCores; ci++) {
    const slot = CS.cores[ci];
    if (slot) {
      const p = getProc(slot.pid);
      if (!p) { CS.cores[ci] = null; continue; }
      if (p.startTime === null) p.startTime = t;

      CS.ganttByCore[ci].push({ pid: p.pid, color: p.color, newSeg: slot.quantumUsed === 0 });

      p.remainingTime--;
      slot.remainingTime--;
      slot.quantumUsed++;

      if (p.remainingTime <= 0) {
        p.finishTime = t + 1;
        p.turnaroundTime = p.finishTime - p.arrivalTime;
        p.waitingTime = p.turnaroundTime - p.burstTime;
        CS.done.push(p.pid);
        animateDone(slot.pid);
        CS.cores[ci] = null;
      } else if (CS.algorithm === 'rr' && slot.quantumUsed >= CS.quantumMax) {
        CS.readyQueue.push(slot.pid);
        animatePreempt(slot.pid);
        CS.cores[ci] = null;
      } else if ((CS.algorithm === 'mlq' || CS.algorithm === 'mlfq') && slot.quantumUsed >= _mlqQuantumLimit(slot)) {
        const qIdx = slot.queueIdx ?? 0;
        if (CS.algorithm === 'mlfq') {
          const newQ = Math.min(qIdx + 1, 2);
          CS.queueLevels[slot.pid] = newQ;
          CS.queues[newQ].push(slot.pid);
        } else {
          CS.queues[qIdx].push(slot.pid);
        }
        animatePreempt(slot.pid);
        CS.cores[ci] = null;
      }
    } else {
      CS.ganttByCore[ci].push({ pid: null, color: null, newSeg: false });
    }
  }

  sortQueueForAlgo(t + 1);

  CS.tick++;
  renderCS();

  return CS.done.length === CS.processes.length && CS.processes.length > 0;
}

/* ----------------------------------------------------------
   DISPATCH
   ---------------------------------------------------------- */
function dispatchToCore(ci) {
  let pid, queueIdx = 0;
  if (CS.algorithm === 'mlq' || CS.algorithm === 'mlfq') {
    const qi = _highestQueue();
    if (qi === -1) return;
    pid = CS.queues[qi].shift();
    queueIdx = qi;
  } else {
    if (!CS.readyQueue.length) return;
    pid = CS.readyQueue.shift();
  }
  const p = CS.processes.find(proc => proc.pid === pid);
  if (!p) return;
  CS.cores[ci] = { pid, remainingTime: p.remainingTime, quantumUsed: 0, queueIdx };
  animateDispatch(pid);
}

/* backward compat alias */
function dispatch() { _dispatchFreeCores(CS.tick); }

/* ----------------------------------------------------------
   ORDENAR FILA
   ---------------------------------------------------------- */
function sortQueueForAlgo(currentTick) {
  if (!CS.readyQueue.length) return;
  switch (CS.algorithm) {
    case 'sjf':
      CS.readyQueue.sort((a, b) => getProc(a).remainingTime - getProc(b).remainingTime);
      break;
    case 'priority':
      CS.readyQueue.sort((a, b) => getProc(a).priority - getProc(b).priority);
      break;
    case 'hrrn':
      CS.readyQueue.sort((a, b) => hrrnRatio(b, currentTick) - hrrnRatio(a, currentTick));
      break;
  }
}

function hrrnRatio(pid, t) {
  const p = getProc(pid);
  const waitTime = t - p.arrivalTime - (p.burstTime - p.remainingTime);
  return (waitTime + p.burstTime) / p.burstTime;
}

function shortestInQueue() {
  return CS.readyQueue.reduce((best, pid) => {
    const bp = getProc(best), cp = getProc(pid);
    return cp.remainingTime < bp.remainingTime ? pid : best;
  }, CS.readyQueue[0]);
}

function getProc(pid) {
  return CS.processes.find(p => p.pid === pid);
}

/* ----------------------------------------------------------
   RENDER PRINCIPAL
   ---------------------------------------------------------- */
function renderCS() {
  renderArriving();
  renderQueue();
  renderCPU();
  renderGantt();
  renderDone();
  const clockEl = document.getElementById('cs-clock');
  if (clockEl) clockEl.textContent = CS.tick;

  // Update queue box label for MLQ/MLFQ
  const lbl = document.getElementById('cs-queue-label');
  if (lbl) {
    if (CS.algorithm === 'mlq')       lbl.textContent = '🔀 Multilevel Queue — 3 niveles';
    else if (CS.algorithm === 'mlfq') lbl.textContent = '⬇ Multilevel Feedback Queue';
    else                              lbl.textContent = '🍿 Fila de Espera — Ready Queue';
  }
}

/* ── Próximos estrenos ── */
function renderArriving() {
  const zone = document.getElementById('cs-arriving');
  if (!zone) return;
  const pending = CS.arriving.filter(p => p.arrivalTime > CS.tick);
  zone.innerHTML = pending.slice(0, 4).map(p =>
    customerCard(p, 'arriving', `llega en t=${p.arrivalTime}`)
  ).join('') + (pending.length > 4 ? `<div class="cs-more">+${pending.length - 4}</div>` : '');
}

/* ── Ready Queue ── */
function renderQueue() {
  const zone = document.getElementById('cs-queue-items');
  if (!zone) return;
  if (CS.algorithm === 'mlq' || CS.algorithm === 'mlfq') {
    renderQueueMLQ(zone);
    return;
  }
  zone.innerHTML = CS.readyQueue.map(pid => {
    const p = getProc(pid);
    return p ? customerCard(p, 'queued') : '';
  }).join('');
}

function renderQueueMLQ(zone) {
  const isMlfq = CS.algorithm === 'mlfq';

  // Detect which queue is actively executing (has a process on CPU)
  const activeQueues = new Set();
  CS.cores.forEach(slot => { if (slot) activeQueues.add(slot.queueIdx ?? 0); });

  const qMeta = isMlfq
    ? [
        { label: 'Q0', sub: `RR · q=${CS.mlqQuantums[0]}`, note: '(nueva llegada)' },
        { label: 'Q1', sub: `RR · q=${CS.mlqQuantums[1]}`, note: '(degradado)' },
        { label: 'Q2', sub: 'FCFS · ∞',                    note: '(mayor espera)' },
      ]
    : [
        { label: 'Q0', sub: `RR · q=${CS.mlqQuantums[0]}`, note: 'Alta prioridad' },
        { label: 'Q1', sub: `RR · q=${CS.mlqQuantums[1]}`, note: 'Media prioridad' },
        { label: 'Q2', sub: 'FCFS · ∞',                    note: 'Baja prioridad' },
      ];

  zone.innerHTML = CS.queues.map((q, i) => {
    const cards = q.map(pid => {
      const p = getProc(pid);
      return p ? customerCard(p, 'queued') : '';
    }).join('');
    const isActive = activeQueues.has(i);
    return `<div class="cs-mlq-row${isActive ? ' cs-mlq-row-active' : ''}">
      <div class="cs-mlq-label">
        <strong>${qMeta[i].label}</strong>
        ${qMeta[i].sub}<br><span style="opacity:.55">${qMeta[i].note}</span>
      </div>
      <div class="cs-mlq-cards">
        ${cards || '<span class="cs-mlq-empty">vacía</span>'}
      </div>
    </div>`;
  }).join('');
}

/* ── CPU (todos los cores dentro del único cuadro) ── */
function renderCPU() {
  const zone = document.getElementById('cs-cpu-slot');
  if (!zone) return;

  const slots = Array.isArray(CS.cores) ? CS.cores : [];
  const activeSlots = slots
    .map((slot, ci) => ({ slot, ci }))
    .filter(({ slot }) => slot !== null && slot !== undefined);

  if (!activeSlots.length) {
    zone.innerHTML = `<div class="cs-cpu-idle">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
        <rect x="2" y="3" width="20" height="14" rx="2"/>
        <line x1="8" y1="21" x2="16" y2="21"/>
        <line x1="12" y1="17" x2="12" y2="21"/>
      </svg>
      <span>CPU libre</span>
    </div>`;
    return;
  }

  zone.innerHTML = activeSlots.map(({ slot, ci }) => {
    const p = CS.processes.find(proc => proc.pid === slot.pid);
    if (!p) return '';
    const pct = Math.max(0, Math.round((p.remainingTime / p.burstTime) * 100));
    const rrPct = CS.algorithm === 'rr'
      ? Math.min(100, Math.round((slot.quantumUsed / CS.quantumMax) * 100))
      : null;
    return `<div class="cs-customer cs-running" style="--accent:${p.color}" id="cs-card-${p.pid}">
      <div class="cs-avatar">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="${p.color}">
          <circle cx="12" cy="8" r="4"/><path d="M6 21v-1a5 5 0 0 1 10 0v1"/>
        </svg>
      </div>
      <div class="cs-pid">${p.pid}</div>
      <div class="cs-burst-bar" title="Restante: ${p.remainingTime}/${p.burstTime}">
        <div class="cs-burst-fill" style="width:${pct}%;background:${p.color}"></div>
      </div>
      <div class="cs-remaining" style="color:${p.color}">${p.remainingTime}</div>
      ${rrPct !== null ? `<div class="cs-quantum-bar" title="Quantum: ${slot.quantumUsed}/${CS.quantumMax}">
        <div class="cs-quantum-fill" style="width:${rrPct}%;background:${p.color}"></div>
      </div>` : ''}
      ${slots.length > 1 ? `<div class="cs-subtitle">core ${ci}</div>` : ''}
    </div>`;
  }).join('');
}

/* ----------------------------------------------------------
   RENDER: GANTT (multi-core rows)
   ---------------------------------------------------------- */
function _compactGanttRow(ticks) {
  if (!ticks.length) return [];
  const segs = [];
  let cur = { pid: ticks[0].pid, color: ticks[0].color, count: 1 };
  for (let i = 1; i < ticks.length; i++) {
    const g = ticks[i];
    if (g.pid === cur.pid && !g.newSeg) {
      cur.count++;
    } else {
      segs.push({ ...cur });
      cur = { pid: g.pid, color: g.color, count: 1 };
    }
  }
  segs.push({ ...cur });
  return segs;
}

function renderGantt() {
  const zone = document.getElementById('cs-gantt');
  if (!zone) return;

  const total = CS.ganttByCore[0]?.length || 0;
  if (!total) { zone.innerHTML = ''; return; }

  const numCores = CS.numCores;

  // ── Per-core rows ──
  let rowsHtml = '';
  for (let ci = 0; ci < numCores; ci++) {
    const ticks = CS.ganttByCore[ci];
    const idleCount = ticks.filter(t => t.pid === null).length;
    const idlePct = Math.round((idleCount / total) * 100);
    const segs = _compactGanttRow(ticks);

    let cumCount = 0;
    const bars = segs.map(s => {
      const pct = ((s.count / total) * 100).toFixed(2);
      const bg = s.pid ? s.color : 'rgba(255,255,255,0.07)';
      const lbl = s.pid ?? '';
      const t0 = cumCount;
      cumCount += s.count;
      return `<div class="cs-gantt-seg"
        style="width:${pct}%;background:${bg};min-width:${s.count < 3 ? 12 : 0}px"
        title="${s.pid ?? 'Idle'} · t${t0}–t${t0 + s.count}">
        ${s.count >= 2 ? `<span class="cs-gantt-lbl">${lbl}</span>` : ''}
      </div>`;
    }).join('');

    const labelHtml = numCores > 1
      ? `<div class="cs-gantt-row-label">
          <div>Core ${ci}</div>
          <div class="cs-gantt-idle-pct">${idlePct}% idle</div>
        </div>`
      : '';

    rowsHtml += `
      <div class="cs-gantt-row">
        ${labelHtml}
        <div class="cs-gantt-row-bar">
          <div class="cs-gantt-bar">${bars}</div>
        </div>
      </div>`;
  }

  // ── Tick marks ──
  const step = total <= 20 ? 1 : total <= 60 ? 5 : 10;
  let timeHtml = '';
  for (let i = 0; i <= total; i += step) {
    const pct = ((i / total) * 100).toFixed(2);
    timeHtml += `<div class="cs-gantt-tick" style="left:${pct}%">${i}</div>`;
  }
  if (total % step !== 0) {
    timeHtml += `<div class="cs-gantt-tick" style="left:100%;transform:translateX(-100%)">${total}</div>`;
  }

  const ticksRow = `
    <div class="cs-gantt-row cs-gantt-ticks-row">
      ${numCores > 1 ? '<div class="cs-gantt-row-label"></div>' : ''}
      <div class="cs-gantt-row-bar">
        <div class="cs-gantt-ticks">${timeHtml}</div>
      </div>
    </div>`;

  const headerHtml = numCores > 1
    ? `<div class="cs-gantt-header">
        <span class="cs-gantt-title">Vista por Cores — ${numCores} cores en paralelo</span>
        <span class="cs-gantt-badge">Cada fila = 1 Core CPU físico</span>
      </div>`
    : '';

  zone.innerHTML = `
    ${headerHtml}
    <div class="cs-gantt-multi">
      ${rowsHtml}
      ${ticksRow}
    </div>`;
}

/* ----------------------------------------------------------
   RENDER: COMPLETADOS
   ---------------------------------------------------------- */
function renderDone() {
  const zone = document.getElementById('cs-done-list');
  if (!zone) return;
  if (!CS.done.length) { zone.innerHTML = ''; return; }

  const rows = CS.done.map(pid => {
    const p = getProc(pid);
    if (!p) return '';
    const tat = p.turnaroundTime ?? (p.finishTime - p.arrivalTime);
    const wt = p.waitingTime ?? (tat - p.burstTime);
    return `<tr>
      <td style="padding:5px 10px;">
        <span style="display:inline-flex;align-items:center;gap:6px;">
          <span style="width:9px;height:9px;border-radius:50%;background:${p.color};flex-shrink:0;"></span>
          <strong style="color:#fff;">${p.pid}</strong>
        </span>
      </td>
      <td style="padding:5px 10px;text-align:center;">${p.arrivalTime}</td>
      <td style="padding:5px 10px;text-align:center;">${p.burstTime}</td>
      <td style="padding:5px 10px;text-align:center;color:#7BC67E;font-weight:600;">${tat}</td>
      <td style="padding:5px 10px;text-align:center;color:#EF9F27;font-weight:600;">${wt}</td>
    </tr>`;
  }).join('');

  const doneProcs = CS.done.map(pid => getProc(pid)).filter(Boolean);
  const n = doneProcs.length;
  const avgTAT = (doneProcs.reduce((s, p) => s + (p.turnaroundTime ?? 0), 0) / n).toFixed(2);
  const avgWT = (doneProcs.reduce((s, p) => s + (p.waitingTime ?? 0), 0) / n).toFixed(2);

  zone.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-family:'IBM Plex Mono',monospace;font-size:12px;color:rgba(255,255,255,.8);">
      <thead>
        <tr style="border-bottom:1px solid rgba(0,207,255,.2);">
          <th style="padding:5px 10px;text-align:left;color:rgba(0,207,255,.55);font-weight:500;font-size:10px;letter-spacing:.09em;text-transform:uppercase;">Nombre</th>
          <th style="padding:5px 10px;text-align:center;color:rgba(0,207,255,.55);font-weight:500;font-size:10px;letter-spacing:.09em;text-transform:uppercase;">Arrival</th>
          <th style="padding:5px 10px;text-align:center;color:rgba(0,207,255,.55);font-weight:500;font-size:10px;letter-spacing:.09em;text-transform:uppercase;">Burst</th>
          <th style="padding:5px 10px;text-align:center;color:#7BC67E;font-weight:500;font-size:10px;letter-spacing:.09em;text-transform:uppercase;">TAT</th>
          <th style="padding:5px 10px;text-align:center;color:#EF9F27;font-weight:500;font-size:10px;letter-spacing:.09em;text-transform:uppercase;">WT</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr style="border-top:1px solid rgba(0,207,255,.15);background:rgba(0,207,255,.04);">
          <td colspan="3" style="padding:6px 10px;color:rgba(0,207,255,.45);font-size:10px;letter-spacing:.09em;text-transform:uppercase;">Avg</td>
          <td style="padding:6px 10px;text-align:center;color:#7BC67E;font-weight:700;font-size:13px;">${avgTAT}</td>
          <td style="padding:6px 10px;text-align:center;color:#EF9F27;font-weight:700;font-size:13px;">${avgWT}</td>
        </tr>
      </tfoot>
    </table>`;
}

/* ── Tarjeta de proceso ── */
function customerCard(p, state, subtitle = '') {
  const pct = Math.round((p.remainingTime / p.burstTime) * 100);
  return `
    <div class="cs-customer cs-${state}" style="--accent:${p.color}" id="cs-card-${p.pid}">
      <div class="cs-avatar">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="${p.color}">
          <circle cx="12" cy="8" r="4"/><path d="M6 21v-1a5 5 0 0 1 10 0v1"/>
        </svg>
      </div>
      <div class="cs-pid">${p.pid}</div>
      <div class="cs-burst-bar">
        <div class="cs-burst-fill" style="width:${pct}%;background:${p.color}"></div>
      </div>
      <div class="cs-remaining">${p.remainingTime}</div>
      ${subtitle ? `<div class="cs-subtitle">${subtitle}</div>` : ''}
    </div>`;
}

/* ── Actualizar barra sin re-render ── */
function updateRunningBar(p) {
  // With multi-core, cards have per-core IDs; this is a no-op kept for compat
}

/* ── Animaciones ── */
function animateArrival(pid) {
  requestAnimationFrame(() => {
    const el = document.getElementById(`cs-card-${pid}`);
    if (el) el.style.animation = 'cs-pop-in 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards';
  });
}
function animateDispatch(pid) {
  requestAnimationFrame(() => {
    const el = document.getElementById(`cs-card-${pid}`);
    if (el) el.style.animation = 'cs-dispatch 0.35s ease forwards';
  });
}
function animatePreempt(pid) {
  const el = document.getElementById(`cs-card-${pid}`);
  if (el) el.style.animation = 'cs-preempt 0.3s ease forwards';
}
function animateDone(pid) {
  const el = document.getElementById(`cs-card-${pid}`);
  if (el) el.style.animation = 'cs-done-anim 0.35s ease forwards';
}

/* ── Controles ── */
function updateCSControls() {
  const playBtn = document.getElementById('cs-play-btn');
  if (!playBtn) return;
  if (CS.paused) {
    playBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> Iniciar`;
    playBtn.classList.remove('cs-playing');
  } else {
    playBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Pausar`;
    playBtn.classList.add('cs-playing');
  }
  const stepBtn = document.getElementById('cs-step-btn');
  if (stepBtn) stepBtn.disabled = !CS.paused;

  const algoLbl = document.getElementById('cs-algo-label');
  if (algoLbl) {
    const names = { fcfs: 'FCFS', sjf: 'SJF', hrrn: 'HRRN', rr: 'Round Robin', srtf: 'SRTF', priority: 'Priority', mlq: 'MLQ', mlfq: 'MLFQ' };
    algoLbl.textContent = names[CS.algorithm] || CS.algorithm.toUpperCase();
  }
}

function setCinemaSpeed(val) {
  CS.speed = Math.max(100, 2200 - parseInt(val));
  if (!CS.paused && CS.interval) {
    clearInterval(CS.interval);
    startCinemaInterval();
  }
}

function mostrarToastCS(msg, type) {
  if (typeof mostrarToast === 'function') { mostrarToast(msg, type); return; }
  console.log(`[CinemaCS] ${type}: ${msg}`);
}

/* ============================================================
   OSim — La Taquilla del Cine (Cinema Scheduling Simulator)
   Archivo: cinema-scheduling.js
   Motor de simulación visual tick-by-tick para CPU Scheduling.
   ============================================================ */

/* ----------------------------------------------------------
   ESTADO GLOBAL DEL SIMULADOR
   ---------------------------------------------------------- */
const CS = {
  tick:             0,
  processes:        [],   // copia profunda con remainingTime, startTime, etc.
  arriving:         [],   // procesos pendientes de llegar
  readyQueue:       [],   // PIDs en fila (orden importa)
  running:          null, // { pid, remainingTime, burstTime, quantumUsed, ... }
  done:             [],   // procesos terminados
  quantumMax:       2,
  interval:         null,
  speed:            700,  // ms por tick
  algorithm:        'fcfs',
  paused:           true,
};

const COLORS = [
  '#3d687b','#639922','#EF9F27','#E24B4A',
  '#8B77D4','#1DB884','#e06c75','#61AFEF',
];

/* ----------------------------------------------------------
   INICIALIZAR — llamado cuando se hace clic en "Ver Simulación"
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

  // Crear copia profunda con estado extendido
  CS.processes = procs.map((p, i) => ({
    pid:           p.pid,
    arrivalTime:   p.arrivalTime  ?? 0,
    burstTime:     p.burstTime    ?? 1,
    priority:      p.priority     ?? 1,
    remainingTime: p.burstTime    ?? 1,
    color:         COLORS[i % COLORS.length],
    startTime:     null,
    finishTime:    null,
    quantumUsed:   0,
  }));

  CS.arriving   = [...CS.processes].sort((a, b) => a.arrivalTime - b.arrivalTime);
  CS.readyQueue = [];
  CS.running    = null;
  CS.done       = [];
  CS.tick       = 0;
  CS.paused     = true;
  CS.algorithm  = algoritmoSeleccionado || 'fcfs';
  CS.quantumMax = parseInt(document.getElementById('quantumValue')?.value) || 2;

  renderCS();
  updateCSControls();
  mostrarToastCS(`Simulación lista · ${CS.algorithm.toUpperCase()} · ${CS.processes.length} procesos`, 'info');
}

/* ----------------------------------------------------------
   RESET
   ---------------------------------------------------------- */
function resetCinema(rerenderOnly = false) {
  clearInterval(CS.interval);
  CS.interval = null;
  CS.paused   = true;
  if (!rerenderOnly) {
    CS.tick = 0; CS.readyQueue = []; CS.running = null; CS.done = [];
    CS.arriving = []; CS.processes = [];
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

/* ----------------------------------------------------------
   PASO MANUAL
   ---------------------------------------------------------- */
function stepCinema() {
  if (CS.paused) tickCinema();
}

/* ----------------------------------------------------------
   TICK — corazón del simulador (1 ciclo de reloj)
   ---------------------------------------------------------- */
function tickCinema() {
  const t = CS.tick;

  // 1. Llegadas: procesos cuyo arrivalTime === t entran a la fila
  while (CS.arriving.length && CS.arriving[0].arrivalTime <= t) {
    const p = CS.arriving.shift();
    CS.readyQueue.push(p.pid);
    animateArrival(p.pid);
  }

  // 2. Si CPU libre, seleccionar siguiente proceso según algoritmo
  if (!CS.running && CS.readyQueue.length) {
    dispatch();
  }

  // 3. Ejecutar proceso activo
  if (CS.running) {
    const p = getProc(CS.running.pid);
    if (p.startTime === null) p.startTime = t;

    p.remainingTime--;
    CS.running.remainingTime--;
    CS.running.quantumUsed++;

    updateRunningBar(p);

    // ¿Terminó?
    if (p.remainingTime <= 0) {
      p.finishTime = t + 1;
      CS.done.push(CS.running.pid);
      animateDone(CS.running.pid);
      CS.running = null;

    // ¿Round Robin: quantum agotado?
    } else if (CS.algorithm === 'rr' && CS.running.quantumUsed >= CS.quantumMax) {
      CS.readyQueue.push(CS.running.pid);
      animatePreempt(CS.running.pid);
      CS.running = null;

    // ¿SRTF: llegó alguien con menor remaining?
    } else if (CS.algorithm === 'srtf' && CS.readyQueue.length) {
      const shortest = shortestInQueue();
      const sp = getProc(shortest);
      if (sp && sp.remainingTime < p.remainingTime) {
        CS.readyQueue.push(CS.running.pid);
        animatePreempt(CS.running.pid);
        CS.running = null;
        dispatch(); // inmediatamente despacha al más corto
      }
    }
  }

  // 4. Re-ordenar fila si corresponde (SJF, Priority, HRRN no preemptivo)
  sortQueueForAlgo(t + 1);

  CS.tick++;
  renderCS();

  // ¿Terminó todo?
  return CS.done.length === CS.processes.length && CS.processes.length > 0;
}

/* ----------------------------------------------------------
   DISPATCH — selecciona quién entra al CPU
   ---------------------------------------------------------- */
function dispatch() {
  if (!CS.readyQueue.length) return;
  const pid = CS.readyQueue.shift();
  CS.running = { pid, remainingTime: getProc(pid).remainingTime, quantumUsed: 0 };
  animateDispatch(pid);
}

/* ----------------------------------------------------------
   ORDENAR FILA SEGÚN ALGORITMO
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
      CS.readyQueue.sort((a, b) => {
        const ra = hrrnRatio(a, currentTick);
        const rb = hrrnRatio(b, currentTick);
        return rb - ra; // mayor ratio primero
      });
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

/* ----------------------------------------------------------
   HELPER
   ---------------------------------------------------------- */
function getProc(pid) {
  return CS.processes.find(p => p.pid === pid);
}

/* ----------------------------------------------------------
   RENDER PRINCIPAL — actualiza toda la UI del cine
   ---------------------------------------------------------- */
function renderCS() {
  renderArriving();
  renderQueue();
  renderCPU();
  renderDone();
  const clockEl = document.getElementById('cs-clock');
  if (clockEl) clockEl.textContent = CS.tick;
}

function renderArriving() {
  const zone = document.getElementById('cs-arriving');
  if (!zone) return;
  const pending = CS.arriving.filter(p => p.arrivalTime > CS.tick);
  zone.innerHTML = pending.slice(0, 4).map(p =>
    customerCard(p, 'arriving', `llega en t=${p.arrivalTime}`)
  ).join('') + (pending.length > 4 ? `<div class="cs-more">+${pending.length - 4}</div>` : '');
}

function renderQueue() {
  const zone = document.getElementById('cs-queue-items');
  if (!zone) return;
  zone.innerHTML = CS.readyQueue.map(pid => {
    const p = getProc(pid);
    return p ? customerCard(p, 'queued') : '';
  }).join('');
}

function renderCPU() {
  const zone = document.getElementById('cs-cpu-slot');
  if (!zone) return;
  if (!CS.running) {
    zone.innerHTML = `<div class="cs-cpu-idle">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
        <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
      </svg>
      <span>CPU libre</span>
    </div>`;
    return;
  }
  const p = getProc(CS.running.pid);
  if (!p) return;
  const pct = Math.round((p.remainingTime / p.burstTime) * 100);
  const rrPct = CS.algorithm === 'rr' ? Math.round((CS.running.quantumUsed / CS.quantumMax) * 100) : null;
  zone.innerHTML = `
    <div class="cs-customer cs-running" style="--accent:${p.color}" id="cs-card-${p.pid}">
      <div class="cs-avatar">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="${p.color}">
          <circle cx="12" cy="8" r="4"/><path d="M6 21v-1a5 5 0 0 1 10 0v1"/>
        </svg>
      </div>
      <div class="cs-pid">P${p.pid}</div>
      <div class="cs-burst-bar" title="Tiempo restante: ${p.remainingTime}/${p.burstTime}">
        <div class="cs-burst-fill" style="width:${pct}%;background:${p.color}"></div>
      </div>
      <div class="cs-remaining">${p.remainingTime}</div>
      ${rrPct !== null ? `
        <div class="cs-quantum-bar" title="Quantum: ${CS.running.quantumUsed}/${CS.quantumMax}">
          <div class="cs-quantum-fill" style="width:${rrPct}%"></div>
        </div>` : ''}
    </div>`;
}

function renderDone() {
  const zone = document.getElementById('cs-done-list');
  if (!zone) return;
  zone.innerHTML = CS.done.map(pid => {
    const p = getProc(pid);
    return p ? `<div class="cs-done-chip" style="border-color:${p.color};color:${p.color}">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="${p.color}" stroke-width="3" stroke-linecap="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      P${p.pid}
    </div>` : '';
  }).join('');
}

function customerCard(p, state, subtitle = '') {
  const pct = Math.round((p.remainingTime / p.burstTime) * 100);
  return `
    <div class="cs-customer cs-${state}" style="--accent:${p.color}" id="cs-card-${p.pid}">
      <div class="cs-avatar">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="${p.color}">
          <circle cx="12" cy="8" r="4"/><path d="M6 21v-1a5 5 0 0 1 10 0v1"/>
        </svg>
      </div>
      <div class="cs-pid">P${p.pid}</div>
      <div class="cs-burst-bar">
        <div class="cs-burst-fill" style="width:${pct}%;background:${p.color}"></div>
      </div>
      <div class="cs-remaining">${p.remainingTime}</div>
      ${subtitle ? `<div class="cs-subtitle">${subtitle}</div>` : ''}
    </div>`;
}

/* ----------------------------------------------------------
   ACTUALIZAR BARRA DEL PROCESO EN CPU (sin re-render total)
   ---------------------------------------------------------- */
function updateRunningBar(p) {
  const card = document.getElementById(`cs-card-${p.pid}`);
  if (!card) return;
  const fill = card.querySelector('.cs-burst-fill');
  const rem  = card.querySelector('.cs-remaining');
  const qf   = card.querySelector('.cs-quantum-fill');
  const pct  = Math.round((p.remainingTime / p.burstTime) * 100);
  if (fill) fill.style.width = pct + '%';
  if (rem)  rem.textContent  = p.remainingTime;
  if (qf && CS.running) {
    const qpct = Math.round((CS.running.quantumUsed / CS.quantumMax) * 100);
    qf.style.width = qpct + '%';
  }
}

/* ----------------------------------------------------------
   ANIMACIONES DE TRANSICIÓN
   ---------------------------------------------------------- */
function animateArrival(pid) {
  // La tarjeta aparece con fade-in tras el render
  requestAnimationFrame(() => {
    const el = document.getElementById(`cs-card-${pid}`);
    if (el) {
      el.style.animation = 'cs-pop-in 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards';
    }
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
  if (el) {
    el.style.animation = 'cs-preempt 0.3s ease forwards';
  }
}

function animateDone(pid) {
  const el = document.getElementById(`cs-card-${pid}`);
  if (el) {
    el.style.animation = 'cs-done-anim 0.35s ease forwards';
  }
}

/* ----------------------------------------------------------
   CONTROLES DE UI
   ---------------------------------------------------------- */
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

  // Etiqueta del algoritmo en el panel
  const algoLbl = document.getElementById('cs-algo-label');
  if (algoLbl) {
    const names = {
      fcfs:'FCFS', sjf:'SJF', hrrn:'HRRN', rr:'Round Robin',
      srtf:'SRTF', priority:'Priority', mlq:'MLQ', mlfq:'MLFQ',
    };
    algoLbl.textContent = names[CS.algorithm] || CS.algorithm.toUpperCase();
  }
}

/* ----------------------------------------------------------
   SPEED SLIDER
   ---------------------------------------------------------- */
function setCinemaSpeed(val) {
  CS.speed = Math.max(100, 2200 - parseInt(val));
  if (!CS.paused && CS.interval) {
    clearInterval(CS.interval);
    startCinemaInterval();
  }
}

/* ----------------------------------------------------------
   TOAST SIMPLE PARA EL PANEL
   ---------------------------------------------------------- */
function mostrarToastCS(msg, type) {
  if (typeof mostrarToast === 'function') { mostrarToast(msg, type); return; }
  console.log(`[CinemaCS] ${type}: ${msg}`);
}

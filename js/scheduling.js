/* ============================================================
   OSim — Algoritmos de Scheduling de CPU
   Archivo: scheduling.js
   ============================================================ */

/**
 * Resultado de cada algoritmo:
 * { algoritmo, procesos, segments:[{pid,start,end}], contextSwitches, metricas }
 */

/* ----------------------------------------------------------
   UTILIDADES
   ---------------------------------------------------------- */

function calcularMetricas(procesos) {
  if (!procesos || procesos.length === 0)
    return { avgWaiting: 0, avgTurnaround: 0, avgResponse: 0, cpuUtilization: 0, makespan: 0 };

  let totalWaiting = 0, totalTurnaround = 0, totalResponse = 0, makespan = 0;
  procesos.forEach((p) => {
    totalResponse   += p.startTime - p.arrivalTime;
    totalTurnaround += p.finishTime - p.arrivalTime;
    totalWaiting    += (p.finishTime - p.arrivalTime) - p.burstTime;
    makespan = Math.max(makespan, p.finishTime);
  });
  const count     = procesos.length;
  const totalBurst = procesos.reduce((s, p) => s + p.burstTime, 0);
  const cpuUtil   = makespan > 0 ? ((totalBurst / makespan) * 100).toFixed(2) : 0;
  return {
    avgWaiting:     (totalWaiting    / count).toFixed(2),
    avgTurnaround:  (totalTurnaround / count).toFixed(2),
    avgResponse:    (totalResponse   / count).toFixed(2),
    cpuUtilization: `${cpuUtil}%`,
    makespan,
  };
}

function ordenarPorArrival(procesos) {
  return [...procesos].sort((a, b) => a.arrivalTime - b.arrivalTime);
}

/* Cuenta cambios de contexto en la lista de segmentos cronológicos */
function contarCambiosContexto(segments) {
  let cambios = 0;
  for (let i = 1; i < segments.length; i++)
    if (segments[i].pid !== segments[i - 1].pid) cambios++;
  return cambios;
}

/* Fusiona timeline raw [{pid, time}] en segmentos contiguos */
function _mergeRawTimeline(raw) {
  if (!raw.length) return [];
  const segs = [];
  let cur = { pid: raw[0].pid, start: raw[0].time, end: raw[0].time + 1 };
  for (let i = 1; i < raw.length; i++) {
    if (raw[i].pid === cur.pid && raw[i].time === cur.end) {
      cur.end++;
    } else {
      segs.push(cur);
      cur = { pid: raw[i].pid, start: raw[i].time, end: raw[i].time + 1 };
    }
  }
  segs.push(cur);
  return segs;
}

/* Fusiona raw timeline con info de core [{pid, time, core}] */
function _mergeRawTimelineWithCore(raw) {
  if (!raw.length) return [];
  const segs = [];
  let cur = { pid: raw[0].pid, core: raw[0].core, start: raw[0].time, end: raw[0].time + 1 };
  for (let i = 1; i < raw.length; i++) {
    if (raw[i].pid === cur.pid && raw[i].core === cur.core && raw[i].time === cur.end) {
      cur.end++;
    } else {
      segs.push(cur);
      cur = { pid: raw[i].pid, core: raw[i].core, start: raw[i].time, end: raw[i].time + 1 };
    }
  }
  segs.push(cur);
  return segs;
}

/* ----------------------------------------------------------
   MULTI-CORE: helper no-preemptivo (FCFS, SJF, HRRN)
   pickFn(readyPids, origMap, t) -> pid
   ---------------------------------------------------------- */
function _runMultiCoreNP(procesos, numCores, pickFn) {
  const orig = {};
  procesos.forEach(p => orig[p.pid] = p);

  let pending = [...procesos].sort((a, b) => a.arrivalTime - b.arrivalTime);
  const ready  = []; // pids
  const cores  = Array.from({ length: numCores }, (_, i) => ({ id: i, pid: null, startAt: 0, endAt: 0 }));
  const segments = [];
  const resultado = [];
  let t = 0;

  for (let guard = 0; guard < 200000; guard++) {
    // Admitir llegadas
    pending = pending.filter(p => {
      if (p.arrivalTime <= t) { ready.push(p.pid); return false; }
      return true;
    });

    // Liberar cores terminados
    cores.forEach(c => {
      if (c.pid !== null && c.endAt <= t) {
        const p = orig[c.pid];
        resultado.push({ ...p, startTime: c.startAt, finishTime: c.endAt,
          responseTime:   c.startAt - p.arrivalTime,
          waitingTime:    c.endAt - p.burstTime - p.arrivalTime,
          turnaroundTime: c.endAt - p.arrivalTime });
        c.pid = null;
      }
    });

    // Asignar a cores libres
    for (const c of cores) {
      if (c.pid !== null || ready.length === 0) continue;
      const pid = pickFn(ready, orig, t);
      if (pid == null) break;
      ready.splice(ready.indexOf(pid), 1);
      const p = orig[pid];
      c.pid = pid; c.startAt = t; c.endAt = t + p.burstTime;
      segments.push({ pid, start: t, end: c.endAt, core: c.id });
    }

    if (pending.length === 0 && ready.length === 0 && cores.every(c => c.pid === null)) break;

    // Siguiente evento
    const events = [
      ...cores.filter(c => c.pid !== null).map(c => c.endAt),
      pending.length > 0 ? pending[0].arrivalTime : Infinity
    ].filter(v => v > t);
    const nextT = Math.min(...events);
    if (nextT === Infinity) break;
    t = nextT;
  }

  return { resultado, segments };
}

/* ----------------------------------------------------------
   MULTI-CORE: preemptivo con prioridad de selección (SRTF, Priority)
   selectN(candidates, info, n) -> [pid, ...] (los N mejores)
   ---------------------------------------------------------- */
function _runMultiCorePP(procesos, numCores, selectN) {
  const info = {};
  procesos.forEach(p => {
    info[p.pid] = { ...p, remaining: p.burstTime, firstStart: null };
  });

  let pending = [...procesos].sort((a, b) => a.arrivalTime - b.arrivalTime);
  let ready   = []; // pids en cola
  let running = []; // pids actualmente en ejecución (≤ numCores)
  const rawTimeline = [];
  const resultado   = [];

  for (let t = 0; t <= 200000; t++) {
    pending = pending.filter(p => {
      if (p.arrivalTime <= t) { ready.push(p.pid); return false; }
      return true;
    });

    // Elegir los N mejores entre corriendo + listos
    const candidates = [...running, ...ready];
    if (candidates.length > 0) {
      const bestN = selectN(candidates, info, numCores);

      // Preemptar los que ya no están en bestN
      running.forEach(pid => { if (!bestN.includes(pid)) ready.push(pid); });
      // Despachar los nuevos
      bestN.forEach(pid => {
        if (!running.includes(pid)) {
          ready.splice(ready.indexOf(pid), 1);
          if (info[pid].firstStart === null) info[pid].firstStart = t;
        }
      });
      running = bestN;
    }

    if (running.length === 0 && ready.length === 0 && pending.length === 0) break;

    // Ejecutar un tick en cada proceso
    const finishedNow = [];
    running.forEach((pid, slot) => {
      rawTimeline.push({ pid, time: t, core: slot });
      info[pid].remaining--;
      if (info[pid].remaining === 0) finishedNow.push(pid);
    });

    finishedNow.forEach(pid => {
      running = running.filter(p => p !== pid);
      const p = procesos.find(x => x.pid === pid);
      resultado.push({ ...p, startTime: info[pid].firstStart, finishTime: t + 1,
        responseTime:   info[pid].firstStart - p.arrivalTime,
        waitingTime:    t + 1 - p.burstTime - p.arrivalTime,
        turnaroundTime: t + 1 - p.arrivalTime });
    });

    if (resultado.length === procesos.length) break;
  }

  const segments = _mergeRawTimelineWithCore(rawTimeline);
  return { resultado, segments };
}

/* ----------------------------------------------------------
   MULTI-CORE: Round Robin (cola compartida, N cores)
   ---------------------------------------------------------- */
function _runMultiCoreRR(procesos, numCores, quantum) {
  const info = {};
  procesos.forEach(p => {
    info[p.pid] = { ...p, remaining: p.burstTime, firstStart: null, qLeft: quantum };
  });

  let pending = [...procesos].sort((a, b) => a.arrivalTime - b.arrivalTime);
  const queue  = []; // ready queue (FIFO)
  const cores  = Array.from({ length: numCores }, (_, i) => ({ id: i, pid: null }));
  const rawTimeline = [];
  const resultado   = [];

  const tryAssign = (t) => {
    cores.forEach(c => {
      if (c.pid === null && queue.length > 0) {
        c.pid = queue.shift();
        info[c.pid].qLeft = quantum;
        if (info[c.pid].firstStart === null) info[c.pid].firstStart = t;
      }
    });
  };

  for (let t = 0; t <= 200000; t++) {
    pending = pending.filter(p => {
      if (p.arrivalTime <= t) { info[p.pid].qLeft = quantum; queue.push(p.pid); return false; }
      return true;
    });

    tryAssign(t);

    const finishedNow = [], expiredNow = [];
    cores.forEach(c => {
      if (c.pid === null) return;
      rawTimeline.push({ pid: c.pid, time: t, core: c.id });
      info[c.pid].remaining--;
      info[c.pid].qLeft--;

      if (info[c.pid].remaining === 0) finishedNow.push(c);
      else if (info[c.pid].qLeft <= 0) expiredNow.push(c);
    });

    finishedNow.forEach(c => {
      const p = procesos.find(x => x.pid === c.pid);
      resultado.push({ ...p, startTime: info[c.pid].firstStart, finishTime: t + 1,
        responseTime:   info[c.pid].firstStart - p.arrivalTime,
        waitingTime:    t + 1 - p.burstTime - p.arrivalTime,
        turnaroundTime: t + 1 - p.arrivalTime });
      c.pid = null;
    });

    expiredNow.forEach(c => {
      if (finishedNow.includes(c)) return;
      queue.push(c.pid);
      c.pid = null;
    });

    tryAssign(t + 1);

    if (resultado.length === procesos.length) break;
    if (cores.every(c => c.pid === null) && queue.length === 0 && pending.length === 0) break;
  }

  const segments = _mergeRawTimelineWithCore(rawTimeline);
  return { resultado, segments };
}

/* Genera segmentos para algoritmos no-preemptivos (un bloque por proceso) */
function _segmentosNP(resultado) {
  return [...resultado]
    .sort((a, b) => a.startTime - b.startTime)
    .map(p => ({ pid: p.pid, start: p.startTime, end: p.finishTime }));
}

/* ----------------------------------------------------------
   1. FCFS — First Come First Served (NON-PREEMPTIVE)
   ---------------------------------------------------------- */
function algoritmo_FCFS(procesos, numCores = 1) {
  if (numCores > 1) {
    const pickFn = (ready) => ready[0]; // FIFO
    const { resultado, segments } = _runMultiCoreNP(procesos, numCores, pickFn);
    return { algoritmo: "FCFS", numCores, procesos: resultado, segments,
      contextSwitches: contarCambiosContexto(segments),
      metricas: calcularMetricas(resultado) };
  }

  const copia = ordenarPorArrival(procesos);
  const resultado = [];
  let tiempoActual = 0;

  copia.forEach((p) => {
    const startTime  = Math.max(tiempoActual, p.arrivalTime);
    const finishTime = startTime + p.burstTime;
    resultado.push({ ...p, startTime, finishTime,
      responseTime:   startTime - p.arrivalTime,
      waitingTime:    startTime - p.arrivalTime,
      turnaroundTime: finishTime - p.arrivalTime });
    tiempoActual = finishTime;
  });

  const segments = _segmentosNP(resultado);
  return { algoritmo: "FCFS", numCores: 1, procesos: resultado, segments,
    contextSwitches: contarCambiosContexto(segments),
    metricas: calcularMetricas(resultado) };
}

/* ----------------------------------------------------------
   2. SJF — Shortest Job First (NON-PREEMPTIVE)
   ---------------------------------------------------------- */
function algoritmo_SJF(procesos, numCores = 1) {
  if (numCores > 1) {
    const pickFn = (ready, orig) =>
      ready.reduce((b, pid) => orig[pid].burstTime < orig[b].burstTime ? pid : b, ready[0]);
    const { resultado, segments } = _runMultiCoreNP(procesos, numCores, pickFn);
    return { algoritmo: "SJF", numCores, procesos: resultado, segments,
      contextSwitches: contarCambiosContexto(segments),
      metricas: calcularMetricas(resultado) };
  }

  const listos = [];
  const resultado = [];
  let tiempoActual = 0;
  let procesosRestantes = [...procesos];

  while (procesosRestantes.length > 0 || listos.length > 0) {
    procesosRestantes = procesosRestantes.filter((p) => {
      if (p.arrivalTime <= tiempoActual) { listos.push(p); return false; }
      return true;
    });
    if (listos.length === 0) { tiempoActual = procesosRestantes[0].arrivalTime; continue; }

    listos.sort((a, b) => a.burstTime !== b.burstTime
      ? a.burstTime - b.burstTime : a.arrivalTime - b.arrivalTime);

    const p = listos.shift();
    const startTime  = tiempoActual;
    const finishTime = startTime + p.burstTime;
    resultado.push({ ...p, startTime, finishTime,
      responseTime:   startTime - p.arrivalTime,
      waitingTime:    startTime - p.arrivalTime,
      turnaroundTime: finishTime - p.arrivalTime });
    tiempoActual = finishTime;
  }

  const segments = _segmentosNP(resultado);
  return { algoritmo: "SJF", numCores: 1, procesos: resultado, segments,
    contextSwitches: contarCambiosContexto(segments),
    metricas: calcularMetricas(resultado) };
}

/* ----------------------------------------------------------
   3. HRRN — Highest Response Ratio Next (NON-PREEMPTIVE)
   ---------------------------------------------------------- */
function algoritmo_HRRN(procesos, numCores = 1) {
  if (numCores > 1) {
    const pickFn = (ready, orig, t) =>
      ready.reduce((b, pid) => {
        const rr  = (t - orig[pid].arrivalTime + orig[pid].burstTime) / orig[pid].burstTime;
        const rrB = (t - orig[b].arrivalTime  + orig[b].burstTime)  / orig[b].burstTime;
        return rr > rrB ? pid : b;
      }, ready[0]);
    const { resultado, segments } = _runMultiCoreNP(procesos, numCores, pickFn);
    return { algoritmo: "HRRN", numCores, procesos: resultado, segments,
      contextSwitches: contarCambiosContexto(segments),
      metricas: calcularMetricas(resultado) };
  }
  // single-core
  const listos = [];
  const resultado = [];
  let tiempoActual = 0;
  let procesosRestantes = [...procesos];

  while (procesosRestantes.length > 0 || listos.length > 0) {
    procesosRestantes = procesosRestantes.filter((p) => {
      if (p.arrivalTime <= tiempoActual) { listos.push(p); return false; }
      return true;
    });
    if (listos.length === 0) { tiempoActual = procesosRestantes[0].arrivalTime; continue; }

    let mejor = listos[0];
    let mejorRR = (tiempoActual - mejor.arrivalTime + mejor.burstTime) / mejor.burstTime;
    for (let i = 1; i < listos.length; i++) {
      const rr = (tiempoActual - listos[i].arrivalTime + listos[i].burstTime) / listos[i].burstTime;
      if (rr > mejorRR) { mejorRR = rr; mejor = listos[i]; }
    }
    listos.splice(listos.indexOf(mejor), 1);

    const startTime  = tiempoActual;
    const finishTime = startTime + mejor.burstTime;
    resultado.push({ ...mejor, startTime, finishTime,
      responseTime:   startTime - mejor.arrivalTime,
      waitingTime:    startTime - mejor.arrivalTime,
      turnaroundTime: finishTime - mejor.arrivalTime });
    tiempoActual = finishTime;
  }

  const segments = _segmentosNP(resultado);
  return { algoritmo: "HRRN", numCores: 1, procesos: resultado, segments,
    contextSwitches: contarCambiosContexto(segments),
    metricas: calcularMetricas(resultado) };
}

/* ----------------------------------------------------------
   4. ROUND ROBIN (PREEMPTIVE)
   ---------------------------------------------------------- */
function algoritmo_RoundRobin(procesos, quantum = 2, numCores = 1) {
  if (numCores > 1) {
    const { resultado, segments } = _runMultiCoreRR(procesos, numCores, quantum);
    return { algoritmo: "Round Robin", quantum, numCores, procesos: resultado, segments,
      contextSwitches: contarCambiosContexto(segments),
      metricas: calcularMetricas(resultado) };
  }
  // single-core below
  const cola = [];
  const resultado = [];
  const segments  = [];
  let tiempoActual = 0;
  let procesosRestantes = [...procesos];
  const primeraVez = {};

  while (procesosRestantes.length > 0 || cola.length > 0) {
    procesosRestantes = procesosRestantes.filter((p) => {
      if (p.arrivalTime <= tiempoActual) {
        cola.push({ ...p, tiempoRestante: p.burstTime });
        if (!primeraVez[p.pid]) primeraVez[p.pid] = tiempoActual;
        return false;
      }
      return true;
    });

    if (cola.length === 0) { tiempoActual = procesosRestantes[0].arrivalTime; continue; }

    const proceso         = cola.shift();
    const tiempoEjecucion = Math.min(quantum, proceso.tiempoRestante);
    const segStart        = tiempoActual;

    tiempoActual           += tiempoEjecucion;
    proceso.tiempoRestante -= tiempoEjecucion;
    segments.push({ pid: proceso.pid, start: segStart, end: tiempoActual });

    // Admitir llegadas durante el quantum
    procesosRestantes = procesosRestantes.filter((p) => {
      if (p.arrivalTime <= tiempoActual) {
        cola.push({ ...p, tiempoRestante: p.burstTime });
        if (!primeraVez[p.pid]) primeraVez[p.pid] = tiempoActual;
        return false;
      }
      return true;
    });

    if (proceso.tiempoRestante > 0) {
      cola.push(proceso);
    } else {
      const startTime = primeraVez[proceso.pid];
      resultado.push({ ...proceso, startTime, finishTime: tiempoActual,
        responseTime:   startTime - proceso.arrivalTime,
        waitingTime:    tiempoActual - proceso.burstTime - proceso.arrivalTime,
        turnaroundTime: tiempoActual - proceso.arrivalTime });
    }
  }

  return { algoritmo: "Round Robin", quantum, numCores: 1, procesos: resultado, segments,
    contextSwitches: contarCambiosContexto(segments),
    metricas: calcularMetricas(resultado) };
}

/* ----------------------------------------------------------
   5. SRTF — Shortest Remaining Time First (PREEMPTIVE)
   ---------------------------------------------------------- */
function algoritmo_SRTF(procesos, numCores = 1) {
  if (numCores > 1) {
    const selectN = (candidates, info, n) =>
      [...candidates].sort((a, b) => info[a].remaining - info[b].remaining).slice(0, n);
    const { resultado, segments } = _runMultiCorePP(procesos, numCores, selectN);
    return { algoritmo: "SRTF", numCores, procesos: resultado, segments,
      contextSwitches: contarCambiosContexto(segments),
      metricas: calcularMetricas(resultado) };
  }
  const cola = [];
  const resultado = [];
  const rawTimeline = [];
  let tiempoActual = 0;
  let procesosRestantes = [...procesos];
  const info = {};

  for (let guard = 0; guard <= 100000; guard++) {
    procesosRestantes = procesosRestantes.filter((p) => {
      if (p.arrivalTime === tiempoActual) {
        info[p.pid] = { startTime: null, tiempoRestante: p.burstTime, arrivalTime: p.arrivalTime };
        cola.push(p.pid);
        return false;
      }
      return true;
    });

    if (cola.length === 0 && procesosRestantes.length === 0) break;
    if (cola.length === 0) { tiempoActual = procesosRestantes[0].arrivalTime; continue; }

    let pid = cola[0], menor = info[cola[0]].tiempoRestante;
    for (let i = 1; i < cola.length; i++) {
      if (info[cola[i]].tiempoRestante < menor) { menor = info[cola[i]].tiempoRestante; pid = cola[i]; }
    }

    if (info[pid].startTime === null) info[pid].startTime = tiempoActual;
    rawTimeline.push({ pid, time: tiempoActual });
    info[pid].tiempoRestante--;
    tiempoActual++;

    if (info[pid].tiempoRestante === 0) {
      cola.splice(cola.indexOf(pid), 1);
      const p = procesos.find((x) => x.pid === pid);
      resultado.push({ ...p, startTime: info[pid].startTime, finishTime: tiempoActual,
        responseTime:   info[pid].startTime - p.arrivalTime,
        waitingTime:    tiempoActual - p.burstTime - p.arrivalTime,
        turnaroundTime: tiempoActual - p.arrivalTime });
    }

    for (let j = procesosRestantes.length - 1; j >= 0; j--) {
      if (procesosRestantes[j].arrivalTime <= tiempoActual) {
        const p = procesosRestantes.splice(j, 1)[0];
        info[p.pid] = { startTime: null, tiempoRestante: p.burstTime, arrivalTime: p.arrivalTime };
        cola.push(p.pid);
      }
    }
    if (cola.length === 0 && procesosRestantes.length === 0) break;
  }

  resultado.sort((a, b) => a.pid - b.pid);
  const segments = _mergeRawTimeline(rawTimeline);
  return { algoritmo: "SRTF", numCores: 1, procesos: resultado, segments,
    contextSwitches: contarCambiosContexto(segments),
    metricas: calcularMetricas(resultado) };
}

/* ----------------------------------------------------------
   6. PRIORITY PREEMPTIVE
   ---------------------------------------------------------- */
function algoritmo_PriorityPreemptive(procesos, numCores = 1) {
  if (numCores > 1) {
    const selectN = (candidates, info, n) =>
      [...candidates].sort((a, b) => info[a].priority - info[b].priority).slice(0, n);
    const { resultado, segments } = _runMultiCorePP(procesos, numCores, selectN);
    return { algoritmo: "Priority (Preemptive)", numCores, procesos: resultado, segments,
      contextSwitches: contarCambiosContexto(segments),
      metricas: calcularMetricas(resultado) };
  }
  const cola = [];
  const resultado = [];
  const rawTimeline = [];
  let tiempoActual = 0;
  let procesosRestantes = [...procesos];
  const info = {};

  for (let guard = 0; guard <= 100000; guard++) {
    procesosRestantes = procesosRestantes.filter((p) => {
      if (p.arrivalTime <= tiempoActual) {
        info[p.pid] = { startTime: null, tiempoRestante: p.burstTime,
          priority: p.priority, arrivalTime: p.arrivalTime };
        cola.push(p.pid);
        return false;
      }
      return true;
    });

    if (cola.length === 0 && procesosRestantes.length === 0) break;
    if (cola.length === 0) { tiempoActual = procesosRestantes[0].arrivalTime; continue; }

    cola.sort((a, b) => info[a].priority - info[b].priority);
    const pid = cola[0];
    if (info[pid].startTime === null) info[pid].startTime = tiempoActual;

    rawTimeline.push({ pid, time: tiempoActual });
    info[pid].tiempoRestante--;
    tiempoActual++;

    if (info[pid].tiempoRestante === 0) {
      cola.shift();
      const p = procesos.find((x) => x.pid === pid);
      resultado.push({ ...p, startTime: info[pid].startTime, finishTime: tiempoActual,
        responseTime:   info[pid].startTime - p.arrivalTime,
        waitingTime:    tiempoActual - p.burstTime - p.arrivalTime,
        turnaroundTime: tiempoActual - p.arrivalTime });
    }
  }

  resultado.sort((a, b) => a.pid - b.pid);
  const segments = _mergeRawTimeline(rawTimeline);
  return { algoritmo: "Priority (Preemptive)", numCores: 1, procesos: resultado, segments,
    contextSwitches: contarCambiosContexto(segments),
    metricas: calcularMetricas(resultado) };
}

/* ----------------------------------------------------------
   HELPER: seleccionar proceso de una cola según el algoritmo
   ---------------------------------------------------------- */
function _pickFromQueue(queue, info, algo) {
  if (!queue.length) return null;
  if (algo === "fcfs" || algo === "rr") return queue[0];
  if (algo === "sjf") {
    return queue.reduce((best, pid) =>
      info[pid].tiempoRestante < info[best].tiempoRestante ? pid : best, queue[0]);
  }
  if (algo === "priority") {
    return queue.reduce((best, pid) =>
      info[pid].priority < info[best].priority ? pid : best, queue[0]);
  }
  return queue[0];
}

/* ----------------------------------------------------------
   7. MULTILEVEL QUEUE
   Tres colas fijas por prioridad del proceso:
     Q0 (priority ≤ 1): configurable — mayor prioridad
     Q1 (priority = 2): configurable
     Q2 (priority ≥ 3): configurable
   Una cola de mayor prioridad siempre preempta a una menor.
   Procesos NO bajan de cola (MLQ clásico).
   configs = [{algo:'rr', quantum:2}, {algo:'rr', quantum:4}, {algo:'fcfs'}]
   ---------------------------------------------------------- */
function algoritmo_MultilevelQueue(procesos, configs) {
  const defaultConfigs = [
    { algo: "rr", quantum: 2 },
    { algo: "rr", quantum: 4 },
    { algo: "fcfs" },
  ];
  const cfgs = configs || defaultConfigs;
  const getQueue = (p) => p.priority <= 1 ? 0 : p.priority <= 2 ? 1 : 2;

  const info = {};
  procesos.forEach(p => { info[p.pid] = { ...p, tiempoRestante: p.burstTime, firstStart: null }; });

  let pendientes   = [...procesos].sort((a, b) => a.arrivalTime - b.arrivalTime);
  const queues     = [[], [], []];
  const resultado  = [];
  const rawTimeline = [];
  let tiempoActual = 0;
  let exec = null; // { pid, queueIdx, quantumUsed }

  for (let guard = 0; guard <= 200000; guard++) {
    // Admitir procesos llegados
    pendientes = pendientes.filter(p => {
      if (p.arrivalTime <= tiempoActual) { queues[getQueue(p)].push(p.pid); return false; }
      return true;
    });

    // Cola más prioritaria con procesos
    let nextQ = -1;
    for (let i = 0; i < 3; i++) { if (queues[i].length > 0) { nextQ = i; break; } }

    // Preempción: si hay cola con más prioridad que la actual
    if (exec && nextQ !== -1 && nextQ < exec.queueIdx) {
      queues[exec.queueIdx].unshift(exec.pid);
      exec = null;
    }

    if (!exec) {
      if (nextQ === -1) {
        if (pendientes.length === 0) break;
        tiempoActual = pendientes[0].arrivalTime;
        continue;
      }
      const cfg = cfgs[nextQ];
      const pid = _pickFromQueue(queues[nextQ], info, cfg.algo);
      queues[nextQ].splice(queues[nextQ].indexOf(pid), 1);
      exec = { pid, queueIdx: nextQ, quantumUsed: 0 };
    }

    const p = info[exec.pid];
    if (p.firstStart === null) p.firstStart = tiempoActual;

    rawTimeline.push({ pid: exec.pid, time: tiempoActual });
    tiempoActual++;
    p.tiempoRestante--;
    exec.quantumUsed++;

    if (p.tiempoRestante === 0) {
      resultado.push({ pid: p.pid, arrivalTime: p.arrivalTime, burstTime: p.burstTime,
        priority: p.priority, pages: p.pages,
        startTime: p.firstStart, finishTime: tiempoActual,
        responseTime:   p.firstStart - p.arrivalTime,
        waitingTime:    tiempoActual - p.burstTime - p.arrivalTime,
        turnaroundTime: tiempoActual - p.arrivalTime });
      exec = null;
    } else {
      const cfg = cfgs[exec.queueIdx];
      if (cfg.algo === "rr" && exec.quantumUsed >= cfg.quantum) {
        queues[exec.queueIdx].push(exec.pid); // vuelve a su misma cola
        exec = null;
      }
      // Para no-RR: el proceso continúa hasta que sea preemptado por cola mayor o termine
    }

    if (resultado.length === procesos.length) break;
  }

  const segments = _mergeRawTimeline(rawTimeline);
  return { algoritmo: "Multilevel Queue", procesos: resultado, segments,
    contextSwitches: contarCambiosContexto(segments),
    metricas: calcularMetricas(resultado) };
}

/* ----------------------------------------------------------
   8. MULTILEVEL FEEDBACK QUEUE
   Tres colas con degradación por quantum agotado:
     Q0: configurable (todos los procesos entran aquí)
     Q1: configurable (degradados de Q0)
     Q2: configurable (degradados de Q1)
   Si un proceso agota su quantum en una cola RR, baja a la siguiente.
   Nuevas llegadas van a Q0 y preemptan procesos en Q1/Q2.
   configs = [{algo:'rr', quantum:2}, {algo:'rr', quantum:4}, {algo:'fcfs'}]
   ---------------------------------------------------------- */
function algoritmo_MultilevelFeedbackQueue(procesos, configs) {
  const defaultConfigs = [
    { algo: "rr", quantum: 2 },
    { algo: "rr", quantum: 4 },
    { algo: "fcfs" },
  ];
  const cfgs = configs || defaultConfigs;

  const info = {};
  procesos.forEach(p => {
    info[p.pid] = { ...p, tiempoRestante: p.burstTime, queue: 0, firstStart: null };
  });

  let pendientes   = [...procesos].sort((a, b) => a.arrivalTime - b.arrivalTime);
  const queues     = [[], [], []];
  const resultado  = [];
  const rawTimeline = [];
  let tiempoActual = 0;
  let exec = null; // { pid, quantumUsed }

  for (let guard = 0; guard <= 200000; guard++) {
    // Nuevas llegadas van a Q0
    pendientes = pendientes.filter(p => {
      if (p.arrivalTime <= tiempoActual) { queues[0].push(p.pid); return false; }
      return true;
    });

    let nextQ = -1;
    for (let i = 0; i < 3; i++) { if (queues[i].length > 0) { nextQ = i; break; } }

    // Preempción: cola de mayor prioridad preempta a cola menor
    if (exec && nextQ !== -1 && nextQ < info[exec.pid].queue) {
      queues[info[exec.pid].queue].unshift(exec.pid);
      exec = null;
    }

    if (!exec) {
      if (nextQ === -1) {
        if (pendientes.length === 0) break;
        tiempoActual = pendientes[0].arrivalTime;
        continue;
      }
      const cfg = cfgs[nextQ];
      const pid = _pickFromQueue(queues[nextQ], info, cfg.algo);
      queues[nextQ].splice(queues[nextQ].indexOf(pid), 1);
      exec = { pid, quantumUsed: 0 };
    }

    const p = info[exec.pid];
    if (p.firstStart === null) p.firstStart = tiempoActual;

    rawTimeline.push({ pid: exec.pid, time: tiempoActual });
    tiempoActual++;
    p.tiempoRestante--;
    exec.quantumUsed++;

    if (p.tiempoRestante === 0) {
      resultado.push({ pid: p.pid, arrivalTime: p.arrivalTime, burstTime: p.burstTime,
        priority: p.priority, pages: p.pages,
        startTime: p.firstStart, finishTime: tiempoActual,
        responseTime:   p.firstStart - p.arrivalTime,
        waitingTime:    tiempoActual - p.burstTime - p.arrivalTime,
        turnaroundTime: tiempoActual - p.arrivalTime });
      exec = null;
    } else {
      const cfg = cfgs[p.queue];
      if (cfg.algo === "rr" && exec.quantumUsed >= cfg.quantum) {
        // Degradar a la siguiente cola
        const nextQueue = Math.min(p.queue + 1, 2);
        p.queue = nextQueue;
        queues[nextQueue].push(exec.pid);
        exec = null;
      }
      // Para colas no-RR: el proceso continúa hasta que sea preemptado por Q0 o termine
    }

    if (resultado.length === procesos.length) break;
  }

  const segments = _mergeRawTimeline(rawTimeline);
  return { algoritmo: "Multilevel Feedback Queue", procesos: resultado, segments,
    contextSwitches: contarCambiosContexto(segments),
    metricas: calcularMetricas(resultado) };
}

/* ----------------------------------------------------------
   ROUTER
   ---------------------------------------------------------- */
function ejecutarAlgoritmo(nombreAlgo, procesos, quantum = 2, mlqConfigs = null, mlfqConfigs = null, numCores = 1) {
  if (!procesos || procesos.length === 0) { alert("Agrega procesos primero"); return null; }
  const nc = Math.max(1, numCores || 1);
  switch (nombreAlgo.toLowerCase()) {
    case "fcfs":     return algoritmo_FCFS(procesos, nc);
    case "sjf":      return algoritmo_SJF(procesos, nc);
    case "hrrn":     return algoritmo_HRRN(procesos, nc);
    case "rr":       return algoritmo_RoundRobin(procesos, quantum, nc);
    case "srtf":     return algoritmo_SRTF(procesos, nc);
    case "priority": return algoritmo_PriorityPreemptive(procesos, nc);
    case "mlq":      return algoritmo_MultilevelQueue(procesos, mlqConfigs); // MLQ/MLFQ: 1 core por diseño
    case "mlfq":     return algoritmo_MultilevelFeedbackQueue(procesos, mlfqConfigs);
    default: alert(`Algoritmo no reconocido: ${nombreAlgo}`); return null;
  }
}

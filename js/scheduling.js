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

/* Genera segmentos para algoritmos no-preemptivos (un bloque por proceso) */
function _segmentosNP(resultado) {
  return [...resultado]
    .sort((a, b) => a.startTime - b.startTime)
    .map(p => ({ pid: p.pid, start: p.startTime, end: p.finishTime }));
}

/* ----------------------------------------------------------
   1. FCFS — First Come First Served (NON-PREEMPTIVE)
   ---------------------------------------------------------- */
function algoritmo_FCFS(procesos) {
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
  return { algoritmo: "FCFS", procesos: resultado, segments,
    contextSwitches: contarCambiosContexto(segments),
    metricas: calcularMetricas(resultado) };
}

/* ----------------------------------------------------------
   2. SJF — Shortest Job First (NON-PREEMPTIVE)
   ---------------------------------------------------------- */
function algoritmo_SJF(procesos) {
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
  return { algoritmo: "SJF", procesos: resultado, segments,
    contextSwitches: contarCambiosContexto(segments),
    metricas: calcularMetricas(resultado) };
}

/* ----------------------------------------------------------
   3. HRRN — Highest Response Ratio Next (NON-PREEMPTIVE)
   ---------------------------------------------------------- */
function algoritmo_HRRN(procesos) {
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
  return { algoritmo: "HRRN", procesos: resultado, segments,
    contextSwitches: contarCambiosContexto(segments),
    metricas: calcularMetricas(resultado) };
}

/* ----------------------------------------------------------
   4. ROUND ROBIN (PREEMPTIVE)
   ---------------------------------------------------------- */
function algoritmo_RoundRobin(procesos, quantum = 2) {
  const cola = [];
  const resultado = [];
  const segments  = [];
  let tiempoActual = 0;
  let procesosRestantes = [...procesos];
  // primeraEjecucion: registra cuándo cada proceso EMPIEZA a ejecutar por primera vez
  // (no cuándo entra a la cola, para que responseTime sea correcto)
  const primeraEjecucion = {};

  while (procesosRestantes.length > 0 || cola.length > 0) {
    procesosRestantes = procesosRestantes.filter((p) => {
      if (p.arrivalTime <= tiempoActual) {
        cola.push({ ...p, tiempoRestante: p.burstTime });
        return false;
      }
      return true;
    });

    if (cola.length === 0) { tiempoActual = procesosRestantes[0].arrivalTime; continue; }

    const proceso         = cola.shift();
    const tiempoEjecucion = Math.min(quantum, proceso.tiempoRestante);
    const segStart        = tiempoActual;

    // Registrar primera ejecución real (no la admisión a la cola)
    if (!(proceso.pid in primeraEjecucion)) primeraEjecucion[proceso.pid] = tiempoActual;

    tiempoActual           += tiempoEjecucion;
    proceso.tiempoRestante -= tiempoEjecucion;
    segments.push({ pid: proceso.pid, start: segStart, end: tiempoActual });

    // Admitir llegadas durante el quantum
    procesosRestantes = procesosRestantes.filter((p) => {
      if (p.arrivalTime <= tiempoActual) {
        cola.push({ ...p, tiempoRestante: p.burstTime });
        return false;
      }
      return true;
    });

    if (proceso.tiempoRestante > 0) {
      cola.push(proceso);
    } else {
      const startTime = primeraEjecucion[proceso.pid];
      resultado.push({ ...proceso, startTime, finishTime: tiempoActual,
        responseTime:   startTime - proceso.arrivalTime,
        waitingTime:    tiempoActual - proceso.burstTime - proceso.arrivalTime,
        turnaroundTime: tiempoActual - proceso.arrivalTime });
    }
  }

  return { algoritmo: "Round Robin", quantum, procesos: resultado, segments,
    contextSwitches: contarCambiosContexto(segments),
    metricas: calcularMetricas(resultado) };
}

/* ----------------------------------------------------------
   5. SRTF — Shortest Remaining Time First (PREEMPTIVE)
   ---------------------------------------------------------- */
function algoritmo_SRTF(procesos) {
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
  return { algoritmo: "SRTF", procesos: resultado, segments,
    contextSwitches: contarCambiosContexto(segments),
    metricas: calcularMetricas(resultado) };
}

/* ----------------------------------------------------------
   6. PRIORITY PREEMPTIVE
   ---------------------------------------------------------- */
function algoritmo_PriorityPreemptive(procesos) {
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
  return { algoritmo: "Priority (Preemptive)", procesos: resultado, segments,
    contextSwitches: contarCambiosContexto(segments),
    metricas: calcularMetricas(resultado) };
}

/* ----------------------------------------------------------
   7. MULTILEVEL QUEUE
   Tres colas fijas por prioridad del proceso:
     Q0 (priority ≤ 1): RR quantum=2  — mayor prioridad
     Q1 (priority = 2): RR quantum=4
     Q2 (priority ≥ 3): FCFS
   Una cola de mayor prioridad siempre preempta a una menor.
   Procesos NO bajan de cola (MLQ clásico).
   ---------------------------------------------------------- */
function algoritmo_MultilevelQueue(procesos, quantumQ0 = 2, quantumQ1 = 4) {
  const getQueue  = (p) => p.priority <= 1 ? 0 : p.priority <= 2 ? 1 : 2;
  const quantums  = [quantumQ0, quantumQ1, Infinity];

  const info = {};
  procesos.forEach(p => { info[p.pid] = { ...p, tiempoRestante: p.burstTime, firstStart: null }; });

  let pendientes   = [...procesos].sort((a, b) => a.arrivalTime - b.arrivalTime);
  const queues     = [[], [], []];
  const resultado  = [];
  const rawTimeline = [];
  let tiempoActual = 0;
  let exec = null; // { pid, queueIdx, quantumUsed }

  for (let guard = 0; guard <= 100000; guard++) {
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
      exec = { pid: queues[nextQ].shift(), queueIdx: nextQ, quantumUsed: 0 };
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
    } else if (exec.quantumUsed >= quantums[exec.queueIdx]) {
      queues[exec.queueIdx].push(exec.pid); // vuelve a su misma cola
      exec = null;
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
     Q0: RR quantum=2  (todos los procesos entran aquí)
     Q1: RR quantum=4
     Q2: FCFS
   Si un proceso agota su quantum, baja a la siguiente cola.
   Nuevas llegadas van a Q0 y preemptan procesos en Q1/Q2.
   ---------------------------------------------------------- */
function algoritmo_MultilevelFeedbackQueue(procesos) {
  const quantums = [2, 4, Infinity];

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

  for (let guard = 0; guard <= 100000; guard++) {
    // Nuevas llegadas van a Q0
    pendientes = pendientes.filter(p => {
      if (p.arrivalTime <= tiempoActual) { queues[0].push(p.pid); return false; }
      return true;
    });

    let nextQ = -1;
    for (let i = 0; i < 3; i++) { if (queues[i].length > 0) { nextQ = i; break; } }

    // Preempción: Q0 con proceso nuevo preempta a Q1/Q2
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
      exec = { pid: queues[nextQ].shift(), quantumUsed: 0 };
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
    } else if (exec.quantumUsed >= quantums[p.queue]) {
      // Degradar a la siguiente cola
      const nextQueue = Math.min(p.queue + 1, 2);
      p.queue = nextQueue;
      queues[nextQueue].push(exec.pid);
      exec = null;
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
function ejecutarAlgoritmo(nombreAlgo, procesos, quantum = 2) {
  if (!procesos || procesos.length === 0) { alert("Agrega procesos primero"); return null; }
  switch (nombreAlgo.toLowerCase()) {
    case "fcfs":     return algoritmo_FCFS(procesos);
    case "sjf":      return algoritmo_SJF(procesos);
    case "hrrn":     return algoritmo_HRRN(procesos);
    case "rr":       return algoritmo_RoundRobin(procesos, quantum);
    case "srtf":     return algoritmo_SRTF(procesos);
    case "priority": return algoritmo_PriorityPreemptive(procesos);
    case "mlq":      return algoritmo_MultilevelQueue(procesos);
    case "mlfq":     return algoritmo_MultilevelFeedbackQueue(procesos);
    default: alert(`Algoritmo no reconocido: ${nombreAlgo}`); return null;
  }
}

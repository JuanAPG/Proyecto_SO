/* ============================================================
   OSim — Algoritmos de Scheduling de CPU
   Archivo: scheduling.js
   Descripción: Implementación de 8 algoritmos de scheduling
   ============================================================ */

/**
 * ESTRUCTURA DE DATOS DE RESULTADO
 * Cada algoritmo retorna un objeto con:
 * {
 *   algoritmo: "FCFS",
 *   procesos: [{pid, arrivalTime, burstTime, priority, pages, state, startTime, finishTime}],
 *   timeline: [{ time, action, proceso }],
 *   metricas: { avgWaiting, avgTurnaround, avgResponse, cpuUtilization, makespan }
 * }
 */

/* ----------------------------------------------------------
   UTILIDADES GENERALES
   ---------------------------------------------------------- */

/**
 * Calcula métricas para una lista de procesos ejecutados
 * @param {Array} procesos - Array con {pid, arrivalTime, burstTime, startTime, finishTime}
 * @returns {Object} Métricas calculadas
 */
function calcularMetricas(procesos) {
  if (!procesos || procesos.length === 0) {
    return {
      avgWaiting: 0,
      avgTurnaround: 0,
      avgResponse: 0,
      cpuUtilization: 0,
      makespan: 0,
    };
  }

  let totalWaiting = 0;
  let totalTurnaround = 0;
  let totalResponse = 0;
  let makespan = 0;

  procesos.forEach((p) => {
    const responseTime = p.startTime - p.arrivalTime;
    const turnaroundTime = p.finishTime - p.arrivalTime;
    const waitingTime = turnaroundTime - p.burstTime;

    totalResponse += responseTime;
    totalTurnaround += turnaroundTime;
    totalWaiting += waitingTime;

    makespan = Math.max(makespan, p.finishTime);
  });

  const count = procesos.length;
  const totalBurst = procesos.reduce((sum, p) => sum + p.burstTime, 0);
  const cpuUtil = makespan > 0 ? ((totalBurst / makespan) * 100).toFixed(2) : 0;

  return {
    avgWaiting: (totalWaiting / count).toFixed(2),
    avgTurnaround: (totalTurnaround / count).toFixed(2),
    avgResponse: (totalResponse / count).toFixed(2),
    cpuUtilization: `${cpuUtil}%`,
    makespan: makespan,
  };
}

/**
 * Ordena procesos por arrival time
 */
function ordenarPorArrival(procesos) {
  return [...procesos].sort((a, b) => a.arrivalTime - b.arrivalTime);
}

/* ----------------------------------------------------------
   1. FCFS — First Come First Served (NON-PREEMPTIVE)
   ---------------------------------------------------------- */

/**
 * FCFS: El primer proceso en llegar es el primero en ejecutarse
 * @param {Array} procesos - Lista de procesos
 * @returns {Object} Resultado de ejecución
 */
function algoritmo_FCFS(procesos) {
  const copia = ordenarPorArrival(procesos);
  const resultado = [];
  let tiempoActual = 0;

  copia.forEach((p) => {
    // El proceso espera a que sea su turno
    const startTime = Math.max(tiempoActual, p.arrivalTime);
    const finishTime = startTime + p.burstTime;

    resultado.push({
      ...p,
      startTime,
      finishTime,
      responseTime: startTime - p.arrivalTime,
      waitingTime: startTime - p.arrivalTime,
      turnaroundTime: finishTime - p.arrivalTime,
    });

    tiempoActual = finishTime;
  });

  return {
    algoritmo: "FCFS",
    procesos: resultado,
    metricas: calcularMetricas(resultado),
  };
}

/* ----------------------------------------------------------
   2. SJF — Shortest Job First (NON-PREEMPTIVE)
   ---------------------------------------------------------- */

/**
 * SJF: Se ejecutan primero los procesos con menor burst time
 * Si hay empate, se usa FCFS (arrival time)
 * @param {Array} procesos
 * @returns {Object} Resultado
 */
function algoritmo_SJF(procesos) {
  const listos = [];
  const resultado = [];
  let tiempoActual = 0;
  let procesosRestantes = [...procesos];

  while (procesosRestantes.length > 0 || listos.length > 0) {
    // Agregar procesos que han llegado a la cola
    procesosRestantes = procesosRestantes.filter((p) => {
      if (p.arrivalTime <= tiempoActual) {
        listos.push(p);
        return false;
      }
      return true;
    });

    if (listos.length === 0) {
      // Sin procesos listos, avanza al siguiente arrival
      if (procesosRestantes.length > 0) {
        tiempoActual = procesosRestantes[0].arrivalTime;
      }
      continue;
    }

    // Seleccionar el proceso con menor burst time
    listos.sort((a, b) => {
      if (a.burstTime !== b.burstTime) {
        return a.burstTime - b.burstTime;
      }
      return a.arrivalTime - b.arrivalTime; // Desempate por arrival
    });

    const proceso = listos.shift();
    const startTime = tiempoActual;
    const finishTime = startTime + proceso.burstTime;

    resultado.push({
      ...proceso,
      startTime,
      finishTime,
      responseTime: startTime - proceso.arrivalTime,
      waitingTime: startTime - proceso.arrivalTime,
      turnaroundTime: finishTime - proceso.arrivalTime,
    });

    tiempoActual = finishTime;
  }

  return {
    algoritmo: "SJF",
    procesos: resultado,
    metricas: calcularMetricas(resultado),
  };
}

/* ----------------------------------------------------------
   3. HRRN — Highest Response Ratio Next (NON-PREEMPTIVE)
   ---------------------------------------------------------- */

/**
 * HRRN: Se ejecuta el proceso con mayor Response Ratio
 * RR = (Waiting Time + Burst Time) / Burst Time
 * @param {Array} procesos
 * @returns {Object} Resultado
 */
function algoritmo_HRRN(procesos) {
  const listos = [];
  const resultado = [];
  let tiempoActual = 0;
  let procesosRestantes = [...procesos];

  while (procesosRestantes.length > 0 || listos.length > 0) {
    // Agregar procesos que han llegado
    procesosRestantes = procesosRestantes.filter((p) => {
      if (p.arrivalTime <= tiempoActual) {
        listos.push(p);
        return false;
      }
      return true;
    });

    if (listos.length === 0) {
      if (procesosRestantes.length > 0) {
        tiempoActual = procesosRestantes[0].arrivalTime;
      }
      continue;
    }

    // Calcular Response Ratio y seleccionar el máximo
    let mejorProceso = listos[0];
    let mejorRR =
      (tiempoActual - mejorProceso.arrivalTime + mejorProceso.burstTime) /
      mejorProceso.burstTime;

    for (let i = 1; i < listos.length; i++) {
      const rr =
        (tiempoActual - listos[i].arrivalTime + listos[i].burstTime) /
        listos[i].burstTime;
      if (rr > mejorRR) {
        mejorRR = rr;
        mejorProceso = listos[i];
      }
    }

    // Remover de listos
    listos.splice(listos.indexOf(mejorProceso), 1);

    const startTime = tiempoActual;
    const finishTime = startTime + mejorProceso.burstTime;

    resultado.push({
      ...mejorProceso,
      startTime,
      finishTime,
      responseTime: startTime - mejorProceso.arrivalTime,
      waitingTime: startTime - mejorProceso.arrivalTime,
      turnaroundTime: finishTime - mejorProceso.arrivalTime,
    });

    tiempoActual = finishTime;
  }

  return {
    algoritmo: "HRRN",
    procesos: resultado,
    metricas: calcularMetricas(resultado),
  };
}

/* ----------------------------------------------------------
   4. ROUND ROBIN (PREEMPTIVE)
   ---------------------------------------------------------- */

/**
 * RR: Cada proceso recibe un quantum fijo
 * @param {Array} procesos - Lista de procesos
 * @param {number} quantum - Tiempo máximo por ejecución
 * @returns {Object} Resultado
 */
function algoritmo_RoundRobin(procesos, quantum = 2) {
  const cola = [];
  const resultado = [];
  let tiempoActual = 0;
  let procesosRestantes = [...procesos];
  const procesosEnEjecucion = {}; // Mapeo para recordar startTime en primera ejecución

  while (procesosRestantes.length > 0 || cola.length > 0) {
    // Agregar procesos que han llegado
    procesosRestantes = procesosRestantes.filter((p) => {
      if (p.arrivalTime <= tiempoActual) {
        cola.push({ ...p, tiempoRestante: p.burstTime });
        if (!procesosEnEjecucion[p.pid]) {
          procesosEnEjecucion[p.pid] = { startTime: tiempoActual };
        }
        return false;
      }
      return true;
    });

    if (cola.length === 0) {
      if (procesosRestantes.length > 0) {
        tiempoActual = procesosRestantes[0].arrivalTime;
      }
      continue;
    }

    // Ejecutar el primer proceso en la cola
    const proceso = cola.shift();
    const tiempoEjecucion = Math.min(quantum, proceso.tiempoRestante);

    tiempoActual += tiempoEjecucion;
    proceso.tiempoRestante -= tiempoEjecucion;

    // Si aún tiene tiempo restante, vuelve al final de la cola
    if (proceso.tiempoRestante > 0) {
      cola.push(proceso);
    } else {
      // Proceso terminado
      const startTime = procesosEnEjecucion[proceso.pid].startTime;
      resultado.push({
        ...proceso,
        startTime,
        finishTime: tiempoActual,
        responseTime: startTime - proceso.arrivalTime,
        waitingTime: tiempoActual - proceso.burstTime - proceso.arrivalTime,
        turnaroundTime: tiempoActual - proceso.arrivalTime,
      });
    }
  }

  return {
    algoritmo: "Round Robin",
    quantum,
    procesos: resultado,
    metricas: calcularMetricas(resultado),
  };
}

/* ----------------------------------------------------------
   5. SRTF — Shortest Remaining Time First (PREEMPTIVE)
   ---------------------------------------------------------- */

/**
 * SRTF: En cada unidad de tiempo, ejecuta el proceso con menor tiempo restante
 * @param {Array} procesos
 * @returns {Object} Resultado
 */
function algoritmo_SRTF(procesos) {
  const cola = [];
  const resultado = [];
  let tiempoActual = 0;
  let procesosRestantes = [...procesos];
  const procesosInfo = {}; // {pid: {startTime, tiempoRestante}}

  for (let tiempoTotal = 0; tiempoTotal <= 10000; tiempoTotal++) {
    // Agregar procesos que llegan en este momento
    procesosRestantes = procesosRestantes.filter((p) => {
      if (p.arrivalTime === tiempoActual) {
        procesosInfo[p.pid] = {
          startTime: null,
          tiempoRestante: p.burstTime,
          burstOriginal: p.burstTime,
          arrivalTime: p.arrivalTime,
        };
        cola.push(p.pid);
        return false;
      }
      return true;
    });

    if (cola.length === 0 && procesosRestantes.length === 0) {
      break;
    }

    if (cola.length === 0) {
      tiempoActual = procesosRestantes[0].arrivalTime;
      continue;
    }

    // Seleccionar proceso con menor tiempo restante
    let pidEjecucion = cola[0];
    let menorTiempo = procesosInfo[pidEjecucion].tiempoRestante;

    for (let i = 1; i < cola.length; i++) {
      if (procesosInfo[cola[i]].tiempoRestante < menorTiempo) {
        menorTiempo = procesosInfo[cola[i]].tiempoRestante;
        pidEjecucion = cola[i];
      }
    }

    // Registrar inicio si es la primera vez
    if (procesosInfo[pidEjecucion].startTime === null) {
      procesosInfo[pidEjecucion].startTime = tiempoActual;
    }

    // Ejecutar 1 unidad de tiempo
    procesosInfo[pidEjecucion].tiempoRestante--;
    tiempoActual++;

    // Si terminó, remover de cola
    if (procesosInfo[pidEjecucion].tiempoRestante === 0) {
      cola.splice(cola.indexOf(pidEjecucion), 1);

      const p = procesos.find((x) => x.pid === pidEjecucion);
      const info = procesosInfo[pidEjecucion];

      resultado.push({
        ...p,
        startTime: info.startTime,
        finishTime: tiempoActual,
        responseTime: info.startTime - p.arrivalTime,
        waitingTime: tiempoActual - p.burstTime - p.arrivalTime,
        turnaroundTime: tiempoActual - p.arrivalTime,
      });
    }

    // Agregar procesos que llegan ahora (después de ejecutar)
    for (let j = 0; j < procesosRestantes.length; j++) {
      if (procesosRestantes[j].arrivalTime <= tiempoActual) {
        const p = procesosRestantes[j];
        procesosInfo[p.pid] = {
          startTime: null,
          tiempoRestante: p.burstTime,
          burstOriginal: p.burstTime,
          arrivalTime: p.arrivalTime,
        };
        cola.push(p.pid);
        procesosRestantes.splice(j, 1);
        j--;
      }
    }

    // Seguridad: salir si todos los procesos han terminado
    if (cola.length === 0 && procesosRestantes.length === 0) {
      break;
    }
  }

  // Ordenar resultado por PID para consistencia
  resultado.sort((a, b) => a.pid - b.pid);

  return {
    algoritmo: "SRTF",
    procesos: resultado,
    metricas: calcularMetricas(resultado),
  };
}

/* ----------------------------------------------------------
   6. PRIORITY (PREEMPTIVE)
   ---------------------------------------------------------- */

/**
 * Priority Preemptive: Se ejecuta siempre el proceso con mayor prioridad (menor número)
 * @param {Array} procesos
 * @returns {Object} Resultado
 */
function algoritmo_PriorityPreemptive(procesos) {
  const cola = [];
  const resultado = [];
  let tiempoActual = 0;
  let procesosRestantes = [...procesos];
  const procesosInfo = {};

  for (let tiempo = 0; tiempo <= 10000; tiempo++) {
    // Agregar procesos que llegan
    procesosRestantes = procesosRestantes.filter((p) => {
      if (p.arrivalTime <= tiempoActual) {
        procesosInfo[p.pid] = {
          startTime: null,
          tiempoRestante: p.burstTime,
          priority: p.priority,
          arrivalTime: p.arrivalTime,
        };
        cola.push(p.pid);
        return false;
      }
      return true;
    });

    if (cola.length === 0 && procesosRestantes.length === 0) {
      break;
    }

    if (cola.length === 0) {
      tiempoActual = procesosRestantes[0].arrivalTime;
      continue;
    }

    // Ordenar por prioridad (menor número = mayor prioridad)
    cola.sort((a, b) => {
      const prioA = procesosInfo[a].priority;
      const prioB = procesosInfo[b].priority;
      return prioA - prioB;
    });

    const pidEjecucion = cola[0];

    if (procesosInfo[pidEjecucion].startTime === null) {
      procesosInfo[pidEjecucion].startTime = tiempoActual;
    }

    procesosInfo[pidEjecucion].tiempoRestante--;
    tiempoActual++;

    if (procesosInfo[pidEjecucion].tiempoRestante === 0) {
      cola.shift();

      const p = procesos.find((x) => x.pid === pidEjecucion);
      const info = procesosInfo[pidEjecucion];

      resultado.push({
        ...p,
        startTime: info.startTime,
        finishTime: tiempoActual,
        responseTime: info.startTime - p.arrivalTime,
        waitingTime: tiempoActual - p.burstTime - p.arrivalTime,
        turnaroundTime: tiempoActual - p.arrivalTime,
      });
    }
  }

  resultado.sort((a, b) => a.pid - b.pid);

  return {
    algoritmo: "Priority (Preemptive)",
    procesos: resultado,
    metricas: calcularMetricas(resultado),
  };
}

/* ----------------------------------------------------------
   7. MULTILEVEL QUEUE (placeholder)
   ---------------------------------------------------------- */

function algoritmo_MultilevelQueue(procesos) {
  // Por ahora retorna FCFS
  const resultado = algoritmo_FCFS(procesos);
  resultado.algoritmo = "Multilevel Queue (Under Development)";
  return resultado;
}

/* ----------------------------------------------------------
   8. MULTILEVEL FEEDBACK QUEUE (placeholder)
   ---------------------------------------------------------- */

function algoritmo_MultilevelFeedbackQueue(procesos) {
  // Por ahora retorna FCFS
  const resultado = algoritmo_FCFS(procesos);
  resultado.algoritmo = "Multilevel Feedback Queue (Under Development)";
  return resultado;
}

/* ----------------------------------------------------------
   FUNCTION ROUTER — Ejecutar algoritmo según nombre
   ---------------------------------------------------------- */

/**
 * Ejecuta el algoritmo indicado
 * @param {string} nombreAlgo - FCFS, SJF, HRRN, RR, SRTF, Priority, MLQ, MLFQ
 * @param {Array} procesos
 * @param {number} quantum - Para Round Robin
 * @returns {Object} Resultado de ejecución
 */
function ejecutarAlgoritmo(nombreAlgo, procesos, quantum = 2) {
  if (!procesos || procesos.length === 0) {
    alert("⚠️ Agrega procesos primero");
    return null;
  }

  switch (nombreAlgo.toLowerCase()) {
    case "fcfs":
      return algoritmo_FCFS(procesos);
    case "sjf":
      return algoritmo_SJF(procesos);
    case "hrrn":
      return algoritmo_HRRN(procesos);
    case "rr":
      return algoritmo_RoundRobin(procesos, quantum);
    case "srtf":
      return algoritmo_SRTF(procesos);
    case "priority":
      return algoritmo_PriorityPreemptive(procesos);
    case "mlq":
      return algoritmo_MultilevelQueue(procesos);
    case "mlfq":
      return algoritmo_MultilevelFeedbackQueue(procesos);
    default:
      alert(`❌ Algoritmo no reconocido: ${nombreAlgo}`);
      return null;
  }
}

/* ----------------------------------------------------------
   EXPORT para uso global
   ---------------------------------------------------------- */
// Para Node.js / CommonJS (si lo necesitas)
// module.exports = { ejecutarAlgoritmo, calcularMetricas };

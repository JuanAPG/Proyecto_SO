/* ============================================================
   OSim — Módulo de Paginación de Memoria
   Archivo: paginacion.js
   Persona B: Algoritmos de reemplazo de páginas
   Depende de: ui.js (debe cargarse antes)
   ============================================================ */

/* ----------------------------------------------------------
   VARIABLES GLOBALES DEL MÓDULO
   ---------------------------------------------------------- */

let marcos = [];
let historial = [];
let pasoActual = 0;
let configMemoria = {};
let cadenaReferencias = [];
let algoritmoActivo = "fifo";
let autoPlayInterval = null;

/* ----------------------------------------------------------
   ALGORITMOS DE REEMPLAZO DE PÁGINAS
   Cada función devuelve: { pasos, faults, hits }
   Cada paso: { referencia, frames, fault, paginaExpulsada, refBits? }
   ---------------------------------------------------------- */

function simularPaginacion(referencias, numFrames, algoritmo) {
  switch (algoritmo) {
    case "lru":   return algoritmoLRU(referencias, numFrames);
    case "opt":   return algoritmoOPT(referencias, numFrames);
    case "clock": return algoritmoClock(referencias, numFrames);
    case "sc":    return simularSegundaOportunidad(referencias, numFrames);
    default:      return algoritmoFIFO(referencias, numFrames);
  }
}

/* ----------------------------------------------------------
   FIFO — First In, First Out
   ---------------------------------------------------------- */
function algoritmoFIFO(referencias, numFrames) {
  const frames = new Array(numFrames).fill(null);
  const cola   = [];
  const pasos  = [];
  let faults = 0, hits = 0;

  for (let i = 0; i < referencias.length; i++) {
    const pagina = referencias[i];
    const esHit  = frames.includes(pagina);
    let paginaExpulsada = null;

    if (esHit) {
      hits++;
    } else {
      faults++;
      const libre = frames.indexOf(null);
      if (libre !== -1) {
        frames[libre] = pagina;
        cola.push(libre);
      } else {
        const idxVictima  = cola.shift();
        paginaExpulsada   = frames[idxVictima];
        frames[idxVictima] = pagina;
        cola.push(idxVictima);
      }
    }

    pasos.push({ referencia: pagina, frames: [...frames], fault: !esHit, paginaExpulsada });
  }

  return { pasos, faults, hits };
}

/* ----------------------------------------------------------
   LRU — Least Recently Used
   ---------------------------------------------------------- */
function algoritmoLRU(referencias, numFrames) {
  const frames    = new Array(numFrames).fill(null);
  const ultimoUso = {};
  const pasos     = [];
  let faults = 0, hits = 0;

  for (let i = 0; i < referencias.length; i++) {
    const pagina = referencias[i];
    const esHit  = frames.includes(pagina);
    let paginaExpulsada = null;

    if (esHit) {
      hits++;
    } else {
      faults++;
      const libre = frames.indexOf(null);
      if (libre !== -1) {
        frames[libre] = pagina;
      } else {
        let minTiempo = Infinity, idxVictima = 0;
        for (let j = 0; j < numFrames; j++) {
          const t = ultimoUso[frames[j]] ?? -1;
          if (t < minTiempo) { minTiempo = t; idxVictima = j; }
        }
        paginaExpulsada   = frames[idxVictima];
        frames[idxVictima] = pagina;
      }
    }

    ultimoUso[pagina] = i;
    pasos.push({ referencia: pagina, frames: [...frames], fault: !esHit, paginaExpulsada });
  }

  return { pasos, faults, hits };
}

/* ----------------------------------------------------------
   OPT — Optimal / Belady
   ---------------------------------------------------------- */
function algoritmoOPT(referencias, numFrames) {
  const frames = new Array(numFrames).fill(null);
  const pasos  = [];
  let faults = 0, hits = 0;

  for (let i = 0; i < referencias.length; i++) {
    const pagina = referencias[i];
    const esHit  = frames.includes(pagina);
    let paginaExpulsada = null;

    if (esHit) {
      hits++;
    } else {
      faults++;
      const libre = frames.indexOf(null);
      if (libre !== -1) {
        frames[libre] = pagina;
      } else {
        let maxDist = -1, idxVictima = 0;
        for (let j = 0; j < numFrames; j++) {
          const prox = referencias.indexOf(frames[j], i + 1);
          const dist = prox === -1 ? Infinity : prox;
          if (dist > maxDist) { maxDist = dist; idxVictima = j; }
        }
        paginaExpulsada   = frames[idxVictima];
        frames[idxVictima] = pagina;
      }
    }

    pasos.push({ referencia: pagina, frames: [...frames], fault: !esHit, paginaExpulsada });
  }

  return { pasos, faults, hits };
}

/* ----------------------------------------------------------
   CLOCK — Algoritmo de reloj con bit de referencia circular
   ---------------------------------------------------------- */
function algoritmoClock(referencias, numFrames) {
  const frames  = new Array(numFrames).fill(null);
  const refBit  = new Array(numFrames).fill(0);
  let manecilla = 0;
  const pasos   = [];
  let faults = 0, hits = 0;

  for (let i = 0; i < referencias.length; i++) {
    const pagina  = referencias[i];
    const idxHit  = frames.indexOf(pagina);
    const esHit   = idxHit !== -1;
    let paginaExpulsada = null;

    if (esHit) {
      hits++;
      refBit[idxHit] = 1;
    } else {
      faults++;
      while (refBit[manecilla] === 1) {
        refBit[manecilla] = 0;
        manecilla = (manecilla + 1) % numFrames;
      }
      paginaExpulsada   = frames[manecilla];
      frames[manecilla] = pagina;
      refBit[manecilla] = 1;
      manecilla = (manecilla + 1) % numFrames;
    }

    pasos.push({
      referencia: pagina,
      frames:     [...frames],
      fault:      !esHit,
      paginaExpulsada,
      refBits:    [...refBit],
      manecilla,
    });
  }

  return { pasos, faults, hits };
}

/* ----------------------------------------------------------
   SEGUNDA OPORTUNIDAD — Clock usando cola ordenada (no circular)
   Igual que Clock pero en vez de arreglo circular usa una cola
   donde los elementos con bit=1 se mueven al final con bit=0.
   ---------------------------------------------------------- */
function simularSegundaOportunidad(referencias, numFrames) {
  const frames = new Array(numFrames).fill(null);
  // cola: [{ frameIdx, refBit }]  — orden de llegada / segunda oportunidad
  const cola   = [];
  const pasos  = [];
  let faults = 0, hits = 0;

  for (let i = 0; i < referencias.length; i++) {
    const pagina = referencias[i];
    const idxHit = frames.indexOf(pagina);
    const esHit  = idxHit !== -1;
    let paginaExpulsada = null;

    if (esHit) {
      hits++;
      // Dar segunda oportunidad: poner bit = 1
      const entry = cola.find(e => e.frameIdx === idxHit);
      if (entry) entry.refBit = 1;
    } else {
      faults++;
      const libre = frames.indexOf(null);
      if (libre !== -1) {
        frames[libre] = pagina;
        cola.push({ frameIdx: libre, refBit: 0 });
      } else {
        // Recorrer cola dando segunda oportunidad a los que tienen bit=1
        while (cola[0].refBit === 1) {
          const entry = cola.shift();
          entry.refBit = 0;
          cola.push(entry);
        }
        // Reemplazar el frente (bit=0, sin segunda oportunidad)
        const victima = cola.shift();
        paginaExpulsada = frames[victima.frameIdx];
        frames[victima.frameIdx] = pagina;
        cola.push({ frameIdx: victima.frameIdx, refBit: 0 });
      }
    }

    // Snapshot de bits para visualización
    const scBits = new Array(numFrames).fill(0);
    cola.forEach(e => { scBits[e.frameIdx] = e.refBit; });

    pasos.push({
      referencia: pagina,
      frames:     [...frames],
      fault:      !esHit,
      paginaExpulsada,
      refBits:    scBits,
    });
  }

  return { pasos, faults, hits };
}

/* ----------------------------------------------------------
   CONVERSIÓN A FORMATO renderMarcos()
   ---------------------------------------------------------- */

/**
 * Convierte frames a array de marcos con estados para renderMarcos().
 * - "fault"   → nueva página en marco vacío (rojo)
 * - "evicted" → nueva página reemplazó a otra (naranja, hubo expulsión)
 * - "used"    → página residente sin cambio
 * - "empty"   → marco vacío
 */
function construirMarcos(frames, framesPrev, fault, refActual) {
  return frames.map((pagina, i) => {
    if (pagina === null) {
      return { indice: i, pagina: null, proceso: null, estado: "empty" };
    }

    let estado = "used";
    if (fault && pagina === refActual) {
      const entroAqui = !framesPrev || framesPrev[i] !== pagina;
      if (entroAqui) {
        estado = (framesPrev && framesPrev[i] !== null) ? "evicted" : "fault";
      }
    }

    return { indice: i, pagina, proceso: 1, estado };
  });
}

/* ----------------------------------------------------------
   FUNCIÓN PRINCIPAL — iniciarSimulacion()
   ---------------------------------------------------------- */
function iniciarSimulacion() {
  detenerSimulacion();

  const numFrames = parseInt(document.getElementById("inp-frames").value,   10);
  const pageSize  = parseInt(document.getElementById("inp-pagesize").value, 10);
  const memoria   = parseInt(document.getElementById("inp-memoria").value,  10);
  const refStr    = document.getElementById("inp-referencias").value.trim();

  if (isNaN(numFrames) || numFrames < 1) {
    mostrarToast("El número de marcos debe ser ≥ 1.", "error"); return;
  }
  if (isNaN(pageSize) || pageSize < 1) {
    mostrarToast("El tamaño de página debe ser ≥ 1.", "error"); return;
  }
  if (isNaN(memoria) || memoria < 1) {
    mostrarToast("El tamaño de memoria debe ser ≥ 1.", "error"); return;
  }
  if (!refStr) {
    mostrarToast("Ingresa una cadena de referencias", "error"); return;
  }

  const refs = refStr.split(/\s+/).map(Number).filter(n => !isNaN(n) && n >= 0);
  if (refs.length === 0) {
    mostrarToast("La cadena de referencias no es válida.", "error"); return;
  }

  cadenaReferencias = refs;
  configMemoria     = { frames: numFrames, pageSize, memoria };

  const resultado = simularPaginacion(cadenaReferencias, numFrames, algoritmoActivo);
  historial  = resultado.pasos;
  pasoActual = 0;

  // Calcular marcos usados al final de la simulación
  const ultimoPaso  = resultado.pasos[resultado.pasos.length - 1];
  const usados      = ultimoPaso ? ultimoPaso.frames.filter(p => p !== null).length : 0;
  const totalRefs   = cadenaReferencias.length;
  const totalFaults = resultado.faults;
  const totalHits   = resultado.hits;
  const tasa        = totalFaults / totalRefs * 100;

  renderMetricas(document.getElementById("metricas-paginacion"), [
    { label: "Page Faults",    value: totalFaults,              tipo: "fault" },
    { label: "Page Hits",      value: totalHits,                tipo: "good"  },
    { label: "Tasa de fallos", value: fmt(tasa, 1) + "%"                      },
    { label: "Marcos usados",  value: `${usados}/${numFrames}`                },
  ]);

  mostrarPaso(0);
  document.getElementById("controles-steps").style.display = "flex";

  // Actualizar etiqueta de btn-auto
  _actualizarBtnAuto(false);

  mostrarToast("Simulación completada", "success");

  // Actualizar comparación si estaba visible
  if (document.getElementById("seccion-comparacion").style.display !== "none") {
    mostrarComparacion();
  }
}

/* ----------------------------------------------------------
   VISUALIZACIÓN PASO A PASO
   ---------------------------------------------------------- */

function mostrarPaso(idx) {
  if (historial.length === 0) return;

  const paso = historial[idx];
  const prev = idx > 0 ? historial[idx - 1] : null;

  // Construir y renderizar marcos
  marcos = construirMarcos(
    paso.frames,
    prev ? prev.frames : null,
    paso.fault,
    paso.referencia
  );
  renderMarcos(document.getElementById("memoria-grid"), marcos, configMemoria.frames);

  // Referencia actual
  const refEl = document.getElementById("ref-actual");
  if (refEl) {
    refEl.textContent = paso.referencia;
    refEl.className   = "metric-value " + (paso.fault ? "fault" : "good");
  }

  // Badge fault / hit
  const faultEl = document.getElementById("fault-badge");
  if (faultEl) {
    faultEl.innerHTML = paso.fault
      ? `<span class="badge badge-fault">Page Fault</span>`
      : `<span class="badge badge-running">Hit</span>`;
  }

  // Página expulsada
  const expulsadaEl = document.getElementById("pagina-expulsada");
  if (expulsadaEl) {
    if (paso.fault && paso.paginaExpulsada !== null && paso.paginaExpulsada !== undefined) {
      expulsadaEl.innerHTML = `<span class="badge-expulsada">Expulsada: <strong>pág. ${paso.paginaExpulsada}</strong></span>`;
    } else if (paso.fault) {
      expulsadaEl.innerHTML = `<span class="badge-expulsada" style="opacity:.5;">Sin expulsión (marco libre)</span>`;
    } else {
      expulsadaEl.innerHTML = "";
    }
  }

  // Bits de referencia (CLOCK / Segunda Oportunidad)
  const refBitsEl = document.getElementById("ref-bits-panel");
  if (refBitsEl) {
    if (paso.refBits && (algoritmoActivo === "clock" || algoritmoActivo === "sc")) {
      refBitsEl.style.display = "block";
      const bits = paso.refBits;
      const manecillaIdx = paso.manecilla; // solo CLOCK
      refBitsEl.innerHTML = `
        <div class="ref-bits-title">Bits de referencia</div>
        <div class="ref-bits-row">
          ${bits.map((b, i) => `
            <div class="ref-bit-cell ${b === 1 ? "ref-bit-on" : "ref-bit-off"} ${manecillaIdx === i ? "ref-bit-ptr" : ""}">
              <div class="ref-bit-idx">#${i}</div>
              <div class="ref-bit-val">${b}</div>
              ${manecillaIdx === i ? '<div class="ref-bit-arrow">↑</div>' : ''}
            </div>
          `).join("")}
        </div>`;
    } else {
      refBitsEl.style.display = "none";
    }
  }

  // Cadena visual
  renderCadenaVisual(idx);

  // Contador de paso
  const counter = document.getElementById("step-counter");
  if (counter) counter.textContent = `${idx + 1} / ${historial.length}`;

  // Barra de progreso
  _actualizarBarraProgreso(idx);

  pasoActual = idx;
  actualizarBotonesStep();
}

function _actualizarBarraProgreso(idx) {
  const barra = document.getElementById("progress-bar");
  if (!barra || historial.length === 0) return;
  const pct = ((idx + 1) / historial.length * 100).toFixed(1);
  barra.style.width = pct + "%";
}

function renderCadenaVisual(idxActual) {
  const contenedor = document.getElementById("cadena-visual");
  if (!contenedor || cadenaReferencias.length === 0) return;

  const chips = cadenaReferencias.map((ref, i) => {
    let clase = "ref-chip";
    if (i === idxActual) {
      clase += " ref-chip-active";
    } else if (i < idxActual) {
      clase += historial[i] && historial[i].fault ? " ref-chip-fault" : " ref-chip-hit";
    }
    return `<span class="${clase}" onclick="mostrarPaso(${i})" title="Paso ${i + 1}">${ref}</span>`;
  }).join("");

  contenedor.innerHTML = chips;
}

function siguientePaso() { if (pasoActual < historial.length - 1) mostrarPaso(pasoActual + 1); }
function anteriorPaso()   { if (pasoActual > 0)                   mostrarPaso(pasoActual - 1); }
function primerPaso()     { mostrarPaso(0); }
function ultimoPaso()     { mostrarPaso(historial.length - 1); }

function actualizarBotonesStep() {
  const atInicio = pasoActual <= 0;
  const atFinal  = pasoActual >= historial.length - 1;
  const btnPrev  = document.getElementById("btn-prev");
  const btnFirst = document.getElementById("btn-first");
  const btnNext  = document.getElementById("btn-next");
  const btnLast  = document.getElementById("btn-last");
  if (btnPrev)  btnPrev.disabled  = atInicio;
  if (btnFirst) btnFirst.disabled = atInicio;
  if (btnNext)  btnNext.disabled  = atFinal;
  if (btnLast)  btnLast.disabled  = atFinal;
}

/* ----------------------------------------------------------
   AUTO-PLAY — Simular todo con setInterval cada 600ms
   ---------------------------------------------------------- */

function simularTodo() {
  if (historial.length === 0) {
    mostrarToast("Primero presiona Simular.", "error");
    return;
  }

  if (autoPlayInterval) {
    detenerSimulacion();
    return;
  }

  // Si ya llegamos al final, reiniciar desde el principio
  if (pasoActual >= historial.length - 1) mostrarPaso(0);

  _actualizarBtnAuto(true);

  autoPlayInterval = setInterval(() => {
    if (pasoActual >= historial.length - 1) {
      detenerSimulacion();
      return;
    }
    mostrarPaso(pasoActual + 1);
  }, 600);
}

function detenerSimulacion() {
  if (autoPlayInterval) {
    clearInterval(autoPlayInterval);
    autoPlayInterval = null;
  }
  _actualizarBtnAuto(false);
}

function _actualizarBtnAuto(playing) {
  const btn = document.getElementById("btn-auto");
  if (!btn) return;
  if (playing) {
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle;margin-right:4px"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>Detener`;
    btn.classList.add("btn-auto-playing");
  } else {
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle;margin-right:4px"><polygon points="5 3 19 12 5 21 5 3"/></svg>Simular todo`;
    btn.classList.remove("btn-auto-playing");
  }
}

/* ----------------------------------------------------------
   COMPARACIÓN DE ALGORITMOS — Fase 7
   Usa crearMetrica() de ui.js con tipo "good"/"fault" para
   resaltar el mejor y el peor algoritmo.
   ---------------------------------------------------------- */

function mostrarComparacion() {
  if (cadenaReferencias.length === 0) {
    mostrarToast("Ingresa una cadena de referencias", "error");
    return;
  }

  const numFrames = configMemoria.frames;
  const algoritmos = ["fifo", "lru", "opt", "clock", "sc"];
  const total = cadenaReferencias.length;

  const resultados = algoritmos.map(algo => {
    const res = simularPaginacion(cadenaReferencias, numFrames, algo);
    return { algo, nombre: _nombreAlgo(algo), faults: res.faults, hits: res.hits };
  });

  const minFaults = Math.min(...resultados.map(r => r.faults));
  const maxFaults = Math.max(...resultados.map(r => r.faults));

  // ── Tarjetas metrics-grid (Fase 7 spec) ──────────────────
  const gridEl = document.getElementById("comparacion-grid");
  if (gridEl) {
    gridEl.innerHTML = resultados.map(r => {
      const esMejor = r.faults === minFaults;
      const esPeor  = r.faults === maxFaults && maxFaults !== minFaults;
      const tipo    = esMejor ? "good" : esPeor ? "fault" : "";
      return crearMetrica(r.nombre, `${r.faults} fallos`, tipo);
    }).join("");
  }

  // ── Barras comparativas (vista extendida) ────────────────
  const tablaEl = document.getElementById("comparacion-tabla");
  if (tablaEl) {
    tablaEl.innerHTML = resultados.map(r => {
      const esMejor  = r.faults === minFaults;
      const esPeor   = r.faults === maxFaults && maxFaults !== minFaults;
      const barWidth = maxFaults > 0 ? fmt(r.faults / maxFaults * 100, 1) : 0;
      const faultPct = fmt(r.faults / total * 100, 1);
      return `
        <div class="comp-row ${esMejor ? "comp-best" : esPeor ? "comp-worst" : ""}">
          <div class="comp-nombre">${r.nombre}</div>
          <div class="comp-bar-wrap">
            <div class="comp-bar ${esMejor ? "comp-bar-best" : esPeor ? "comp-bar-worst" : ""}"
                 style="width:${barWidth}%"></div>
          </div>
          <div class="comp-stats">
            <span class="comp-faults">${r.faults} fallos</span>
            <span class="comp-hits">${r.hits} hits</span>
            <span class="comp-rate">${faultPct}%</span>
          </div>
          <div class="comp-badge-wrap">
            ${esMejor ? '<span class="comp-badge comp-badge-best">Mejor</span>' : ""}
            ${esPeor  ? '<span class="comp-badge comp-badge-worst">Más fallos</span>' : ""}
          </div>
        </div>`;
    }).join("");
  }

  document.getElementById("seccion-comparacion").style.display = "block";
  document.getElementById("seccion-comparacion").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ----------------------------------------------------------
   SELECCIÓN DE ALGORITMO
   ---------------------------------------------------------- */

function seleccionarAlgoritmo(nombre) {
  algoritmoActivo = nombre;
  document.querySelectorAll(".algo-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.algo === nombre);
  });
  mostrarToast("Algoritmo cambiado a " + algoritmoActivo.toUpperCase(), "info");

  // Mostrar descripción del algoritmo
  const descEl = document.getElementById("algo-desc");
  if (descEl) {
    const descs = {
      fifo:  "Expulsa la página que lleva más tiempo en memoria (la primera que entró).",
      lru:   "Expulsa la página que no ha sido usada por más tiempo (menos usada recientemente).",
      opt:   "Expulsa la página cuyo próximo uso está más lejos en el futuro. Óptimo teórico.",
      clock: "Bit de referencia por marco. Si bit=1 da segunda oportunidad; si bit=0 expulsa.",
      sc:    "Igual que Clock pero usa una cola ordenada en vez de arreglo circular.",
    };
    descEl.textContent = descs[nombre] || "";
  }

  // Mostrar/ocultar panel de bits según algoritmo
  const refBitsEl = document.getElementById("ref-bits-panel");
  if (refBitsEl && historial.length === 0) {
    refBitsEl.style.display = (nombre === "clock" || nombre === "sc") ? "block" : "none";
  }
}

/* ----------------------------------------------------------
   HELPERS
   ---------------------------------------------------------- */

function _nombreAlgo(algo) {
  const nombres = { fifo: "FIFO", lru: "LRU", opt: "Óptimo", clock: "Clock", sc: "2da Oportunidad" };
  return nombres[algo] ?? algo.toUpperCase();
}

/* ----------------------------------------------------------
   RESET
   ---------------------------------------------------------- */

function resetearSimulacion() {
  detenerSimulacion();

  marcos            = [];
  historial         = [];
  pasoActual        = 0;
  cadenaReferencias = [];
  configMemoria     = {};

  const grid = document.getElementById("memoria-grid");
  if (grid) grid.innerHTML = `<p style="color:var(--text-muted);font-size:13px;padding:16px 0;">Configura y presiona Simular.</p>`;

  const metricas = document.getElementById("metricas-paginacion");
  if (metricas) metricas.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">Sin datos aún.</p>`;

  const cadenaVisual = document.getElementById("cadena-visual");
  if (cadenaVisual) cadenaVisual.innerHTML = `<p class="text-muted text-small">Aún no hay simulación.</p>`;

  const controles = document.getElementById("controles-steps");
  if (controles) controles.style.display = "none";

  const refEl = document.getElementById("ref-actual");
  if (refEl) { refEl.textContent = "—"; refEl.className = "metric-value"; }

  const faultEl = document.getElementById("fault-badge");
  if (faultEl) faultEl.innerHTML = "";

  const expulsadaEl = document.getElementById("pagina-expulsada");
  if (expulsadaEl) expulsadaEl.innerHTML = "";

  const refBitsEl = document.getElementById("ref-bits-panel");
  if (refBitsEl) refBitsEl.style.display = "none";

  const barra = document.getElementById("progress-bar");
  if (barra) barra.style.width = "0%";

  const comp = document.getElementById("seccion-comparacion");
  if (comp) comp.style.display = "none";

  mostrarToast("Simulación reiniciada.", "info");
}

/* ----------------------------------------------------------
   CARGA DESDE ARCHIVO
   ---------------------------------------------------------- */

function cargarArchivoMemoria() {
  document.getElementById("file-input-memoria").click();
}

function onArchivoMemoriaSeleccionado(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const texto = e.target.result;
    const { config, errores } = parsearArchivoMemoria(texto);

    if (errores.length > 0) {
      mostrarToast("Error en archivo: " + errores[0], "error");
      return;
    }

    if (config.frames   !== undefined) document.getElementById("inp-frames").value   = config.frames;
    if (config.pagesize !== undefined) document.getElementById("inp-pagesize").value = config.pagesize;
    if (config.memoria  !== undefined) document.getElementById("inp-memoria").value  = config.memoria;

    if (config.referencias !== undefined) {
      document.getElementById("inp-referencias").value = config.referencias;
    }

    mostrarToast("Configuración cargada desde archivo.", "success");
  };

  reader.readAsText(file);
  event.target.value = "";
}

localStorage.setItem('osim_paginacion', JSON.stringify({
  algo: algoActual,      // 'fifo', 'lru', 'opt', etc.
  refs: cadenaDeRefs,    // [7, 0, 1, 2, 0, 3, ...]
  frames: numMarcos,     // 3
  faults: totalFaults,
  hits: totalHits,
  steps: pasos           // el array de pasos que ya genera paginacion.js
}));
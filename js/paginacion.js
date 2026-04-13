/* ============================================================
   OSim — Módulo de Paginación de Memoria
   Archivo: paginacion.js
   Persona B: Algoritmos de reemplazo de páginas
   Depende de: ui.js (debe cargarse antes)
   ============================================================ */

/* ----------------------------------------------------------
   VARIABLES GLOBALES DEL MÓDULO
   ---------------------------------------------------------- */

let marcos = [];             // Estado actual de los marcos (array de objetos marco)
let historial = [];          // Cada paso de la simulación: { referencia, frames, fault, ... }
let pasoActual = 0;          // Índice del paso en modo step-by-step
let configMemoria = {};      // { frames, pageSize, memoria }
let cadenaReferencias = [];  // Secuencia de números de página a cargar

let algoritmoActual = "FIFO"; // Algoritmo seleccionado actualmente

/* ----------------------------------------------------------
   ALGORITMOS DE REEMPLAZO DE PÁGINAS
   ---------------------------------------------------------- */

/**
 * Despacha la cadena de referencias al algoritmo seleccionado.
 * @param {number[]} referencias  - Secuencia de páginas
 * @param {number}   numFrames    - Marcos disponibles
 * @param {string}   algoritmo    - "FIFO" | "LRU" | "OPT" | "LFU" | "CLOCK"
 * @returns {{ pasos: Object[], faults: number, hits: number }}
 */
function simularPaginacion(referencias, numFrames, algoritmo) {
  switch (algoritmo) {
    case "LRU":   return algoritmoLRU(referencias, numFrames);
    case "OPT":   return algoritmoOPT(referencias, numFrames);
    case "LFU":   return algoritmoLFU(referencias, numFrames);
    case "CLOCK": return algoritmoClock(referencias, numFrames);
    default:      return algoritmoFIFO(referencias, numFrames);
  }
}

/* ----------------------------------------------------------
   FIFO — First In, First Out
   Reemplaza la página que lleva más tiempo en memoria.
   ---------------------------------------------------------- */
function algoritmoFIFO(referencias, numFrames) {
  const frames = new Array(numFrames).fill(null);
  const cola   = [];   // índices de marcos en orden de llegada
  const pasos  = [];
  let faults = 0, hits = 0;

  for (let i = 0; i < referencias.length; i++) {
    const pagina = referencias[i];
    const esHit  = frames.includes(pagina);

    if (esHit) {
      hits++;
    } else {
      faults++;
      const libre = frames.indexOf(null);
      if (libre !== -1) {
        frames[libre] = pagina;
        cola.push(libre);
      } else {
        const idxVictima = cola.shift();
        frames[idxVictima] = pagina;
        cola.push(idxVictima);
      }
    }

    pasos.push({ referencia: pagina, frames: [...frames], fault: !esHit });
  }

  return { pasos, faults, hits };
}

/* ----------------------------------------------------------
   LRU — Least Recently Used
   Reemplaza la página que no ha sido usada por más tiempo.
   ---------------------------------------------------------- */
function algoritmoLRU(referencias, numFrames) {
  const frames    = new Array(numFrames).fill(null);
  const ultimoUso = {};  // página → último índice de referencia
  const pasos     = [];
  let faults = 0, hits = 0;

  for (let i = 0; i < referencias.length; i++) {
    const pagina = referencias[i];
    const esHit  = frames.includes(pagina);

    if (esHit) {
      hits++;
    } else {
      faults++;
      const libre = frames.indexOf(null);
      if (libre !== -1) {
        frames[libre] = pagina;
      } else {
        // Marco con menor ultimoUso → víctima
        let minTiempo = Infinity, idxVictima = 0;
        for (let j = 0; j < numFrames; j++) {
          const t = ultimoUso[frames[j]] ?? -1;
          if (t < minTiempo) { minTiempo = t; idxVictima = j; }
        }
        frames[idxVictima] = pagina;
      }
    }

    ultimoUso[pagina] = i;
    pasos.push({ referencia: pagina, frames: [...frames], fault: !esHit });
  }

  return { pasos, faults, hits };
}

/* ----------------------------------------------------------
   OPT — Optimal / Belady
   Reemplaza la página cuyo próximo uso está más lejos en el futuro.
   ---------------------------------------------------------- */
function algoritmoOPT(referencias, numFrames) {
  const frames = new Array(numFrames).fill(null);
  const pasos  = [];
  let faults = 0, hits = 0;

  for (let i = 0; i < referencias.length; i++) {
    const pagina = referencias[i];
    const esHit  = frames.includes(pagina);

    if (esHit) {
      hits++;
    } else {
      faults++;
      const libre = frames.indexOf(null);
      if (libre !== -1) {
        frames[libre] = pagina;
      } else {
        // Página cuyo próximo uso es más lejano (Infinity si no vuelve a usarse)
        let maxDist = -1, idxVictima = 0;
        for (let j = 0; j < numFrames; j++) {
          const prox = referencias.indexOf(frames[j], i + 1);
          const dist = prox === -1 ? Infinity : prox;
          if (dist > maxDist) { maxDist = dist; idxVictima = j; }
        }
        frames[idxVictima] = pagina;
      }
    }

    pasos.push({ referencia: pagina, frames: [...frames], fault: !esHit });
  }

  return { pasos, faults, hits };
}

/* ----------------------------------------------------------
   LFU — Least Frequently Used
   Reemplaza la página usada con menor frecuencia.
   En empate se toma la que entró primero (FIFO).
   ---------------------------------------------------------- */
function algoritmoLFU(referencias, numFrames) {
  const frames     = new Array(numFrames).fill(null);
  const frecuencia = {};  // página → frecuencia de acceso
  const ordenLlegada = []; // páginas en frames ordenadas por tiempo de entrada
  const pasos      = [];
  let faults = 0, hits = 0;

  for (let i = 0; i < referencias.length; i++) {
    const pagina = referencias[i];
    const esHit  = frames.includes(pagina);

    frecuencia[pagina] = (frecuencia[pagina] || 0) + 1;

    if (esHit) {
      hits++;
    } else {
      faults++;
      const libre = frames.indexOf(null);
      if (libre !== -1) {
        frames[libre] = pagina;
        ordenLlegada.push(pagina);
      } else {
        // Víctima: menor frecuencia; empate → más antigua en ordenLlegada
        let minFreq  = Infinity;
        let victima  = null;
        for (const p of ordenLlegada) {
          if (frames.includes(p)) {
            const f = frecuencia[p] ?? 0;
            if (f < minFreq) { minFreq = f; victima = p; }
          }
        }
        const idxVictima = frames.indexOf(victima);
        frames[idxVictima] = pagina;
        ordenLlegada.splice(ordenLlegada.indexOf(victima), 1);
        ordenLlegada.push(pagina);
      }
    }

    pasos.push({ referencia: pagina, frames: [...frames], fault: !esHit });
  }

  return { pasos, faults, hits };
}

/* ----------------------------------------------------------
   CLOCK — Second Chance (algoritmo de reloj)
   Usa un bit de referencia. Si es 1 le da segunda oportunidad;
   si es 0 lo reemplaza.
   ---------------------------------------------------------- */
function algoritmoClock(referencias, numFrames) {
  const frames  = new Array(numFrames).fill(null);
  const refBit  = new Array(numFrames).fill(0);  // bit de referencia
  let manecilla = 0;
  const pasos   = [];
  let faults = 0, hits = 0;

  for (let i = 0; i < referencias.length; i++) {
    const pagina  = referencias[i];
    const idxHit  = frames.indexOf(pagina);
    const esHit   = idxHit !== -1;

    if (esHit) {
      hits++;
      refBit[idxHit] = 1;  // segunda oportunidad
    } else {
      faults++;
      // Avanzar hasta encontrar un marco con bit = 0
      while (refBit[manecilla] === 1) {
        refBit[manecilla] = 0;
        manecilla = (manecilla + 1) % numFrames;
      }
      frames[manecilla] = pagina;
      refBit[manecilla] = 1;
      manecilla = (manecilla + 1) % numFrames;
    }

    pasos.push({
      referencia: pagina,
      frames:     [...frames],
      fault:      !esHit,
      refBits:    [...refBit],
    });
  }

  return { pasos, faults, hits };
}

/* ----------------------------------------------------------
   CONVERSIÓN A FORMATO renderMarcos()
   ---------------------------------------------------------- */

/**
 * Convierte un array de frames (números | null) al formato que
 * espera renderMarcos() de ui.js.
 *
 * @param {Array<number|null>} frames      - Estado actual
 * @param {Array<number|null>} framesPrev  - Estado del paso anterior (puede ser null)
 * @param {boolean}            fault       - Si hubo page fault en este paso
 * @param {number}             refActual   - Página recién cargada
 * @returns {Object[]}
 */
function construirMarcos(frames, framesPrev, fault, refActual) {
  return frames.map((pagina, i) => {
    if (pagina === null) {
      return { indice: i, pagina: null, proceso: null, estado: "empty" };
    }

    let estado = "used";
    if (fault && pagina === refActual) {
      // Marco donde acaba de entrar la página nueva
      const cambio = !framesPrev || framesPrev[i] !== pagina;
      if (cambio) {
        estado = framesPrev && framesPrev[i] !== null ? "evicted" : "fault";
      }
    }

    return { indice: i, pagina, proceso: 1, estado };
  });
}

/* ----------------------------------------------------------
   FUNCIÓN PRINCIPAL — iniciarSimulacion()
   Llamada desde el botón "Simular" en paginacion.html
   ---------------------------------------------------------- */
function iniciarSimulacion() {
  // 1. Leer valores del formulario
  const numFrames = parseInt(document.getElementById("inp-frames").value,   10);
  const pageSize  = parseInt(document.getElementById("inp-pagesize").value, 10);
  const memoria   = parseInt(document.getElementById("inp-memoria").value,  10);
  const refStr    = document.getElementById("inp-referencias").value.trim();

  // 2. Validar
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
    mostrarToast("Ingresa la cadena de referencias.", "error"); return;
  }

  const refs = refStr.split(/\s+/).map(Number).filter(n => !isNaN(n) && n >= 0);
  if (refs.length === 0) {
    mostrarToast("La cadena de referencias no es válida.", "error"); return;
  }

  // 3. Guardar en variables globales
  cadenaReferencias = refs;
  configMemoria     = { frames: numFrames, pageSize, memoria };

  // 4. Ejecutar el algoritmo seleccionado
  const resultado = simularPaginacion(cadenaReferencias, numFrames, algoritmoActual);
  historial   = resultado.pasos;
  pasoActual  = 0;

  // 5. Mostrar métricas
  const total = cadenaReferencias.length;
  renderMetricas(document.getElementById("metricas-memoria"), [
    { label: "Page Faults",    value: resultado.faults,                        tipo: "fault" },
    { label: "Page Hits",      value: resultado.hits,                          tipo: "good"  },
    { label: "Tasa de Fallos", value: fmt(resultado.faults / total * 100, 1) + "%",
      tipo: resultado.faults > resultado.hits ? "fault" : "" },
    { label: "Tasa de Hits",   value: fmt(resultado.hits   / total * 100, 1) + "%",
      tipo: resultado.hits >= resultado.faults ? "good" : "" },
    { label: "Referencias",    value: total },
    { label: "Marcos",         value: numFrames },
  ]);

  // 6. Ir al primer paso y mostrar controles
  mostrarPaso(0);
  document.getElementById("controles-steps").style.display = "flex";
  mostrarToast(
    `${algoritmoActual}: ${resultado.faults} fallos, ${resultado.hits} hits`,
    "success"
  );
}

/* ----------------------------------------------------------
   NAVEGACIÓN STEP-BY-STEP
   ---------------------------------------------------------- */

/** Muestra el estado del paso `idx` en la visualización. */
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
  renderMarcos(document.getElementById("memoria-grid"), marcos);

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

  // Cadena visual
  renderCadenaVisual(idx);

  // Contador de paso
  const counter = document.getElementById("step-counter");
  if (counter) counter.textContent = `${idx + 1} / ${historial.length}`;

  pasoActual = idx;
  actualizarBotonesStep();
}

/** Renderiza los chips de la cadena resaltando el paso actual. */
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

/** Habilita / deshabilita los botones de navegación. */
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
   SELECCIÓN DE ALGORITMO
   ---------------------------------------------------------- */

/** Marca el botón activo y actualiza algoritmoActual. */
function seleccionarAlgoritmo(nombre) {
  algoritmoActual = nombre;
  document.querySelectorAll(".algo-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.algo === nombre);
  });
}

/* ----------------------------------------------------------
   RESET
   ---------------------------------------------------------- */

/** Limpia toda la visualización y devuelve la página a su estado inicial. */
function resetearSimulacion() {
  marcos            = [];
  historial         = [];
  pasoActual        = 0;
  cadenaReferencias = [];
  configMemoria     = {};

  const grid = document.getElementById("memoria-grid");
  if (grid) {
    grid.innerHTML = `<p style="color:var(--text-muted);font-size:13px;padding:16px 0;">Configura y presiona Simular.</p>`;
  }

  const metricas = document.getElementById("metricas-memoria");
  if (metricas) metricas.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">Sin datos aún.</p>`;

  const cadenaVisual = document.getElementById("cadena-visual");
  if (cadenaVisual) {
    cadenaVisual.innerHTML = `<p class="text-muted text-small">Aún no hay simulación.</p>`;
  }

  const controles = document.getElementById("controles-steps");
  if (controles) controles.style.display = "none";

  const refEl = document.getElementById("ref-actual");
  if (refEl) { refEl.textContent = "—"; refEl.className = "metric-value"; }

  const faultEl = document.getElementById("fault-badge");
  if (faultEl) faultEl.innerHTML = "";

  mostrarToast("Simulación reiniciada.", "info");
}

/* ----------------------------------------------------------
   CARGA DESDE ARCHIVO
   ---------------------------------------------------------- */

/** Abre el selector de archivo del sistema operativo. */
function cargarArchivoMemoria() {
  document.getElementById("file-input-memoria").click();
}

/**
 * Maneja el evento change del input[type=file].
 * Usa parsearArchivoMemoria() de ui.js para leer el .txt y
 * luego rellena automáticamente los campos del formulario.
 *
 * Formato esperado del archivo memoria.txt:
 *   Memoria=64
 *   PageSize=4
 *   Frames=3
 *   Referencias=7 0 1 2 0 3 0 4   (opcional)
 */
function onArchivoMemoriaSeleccionado(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const texto = e.target.result;
    const { config, errores } = parsearArchivoMemoria(texto);

    if (errores.length > 0) {
      mostrarToast("Error en el archivo: " + errores[0], "error");
      return;
    }

    // Poblar campos del formulario con los valores leídos
    if (config.frames   !== undefined) document.getElementById("inp-frames").value   = config.frames;
    if (config.pagesize !== undefined) document.getElementById("inp-pagesize").value = config.pagesize;
    if (config.memoria  !== undefined) document.getElementById("inp-memoria").value  = config.memoria;

    // Campo opcional de referencias en el archivo
    if (config.referencias !== undefined) {
      document.getElementById("inp-referencias").value = config.referencias;
    }

    mostrarToast("Configuración cargada desde archivo.", "success");
  };

  reader.readAsText(file);

  // Permitir volver a seleccionar el mismo archivo
  event.target.value = "";
}

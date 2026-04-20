/* ============================================================
   OSim — Módulo de Paginación de Memoria
   Archivo: paginacion.js  (MemoryCinema edition)
   Persona B: Algoritmos de reemplazo de páginas
   Depende de: ui.js (debe cargarse antes)
   ============================================================ */

/* ----------------------------------------------------------
   VARIABLES GLOBALES
   ---------------------------------------------------------- */
let marcos            = [];
let historial         = [];
let pasoActual        = 0;
let configMemoria     = {};
let cadenaReferencias = [];
let algoritmoActivo   = "fifo";
let autoPlayInterval  = null;
let _audioCtx         = null;

/* ----------------------------------------------------------
   ALGORITMOS DE REEMPLAZO
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

/* FIFO */
function algoritmoFIFO(referencias, numFrames) {
  const frames = new Array(numFrames).fill(null);
  const cola   = [];
  const pasos  = [];
  let faults = 0, hits = 0;
  for (let i = 0; i < referencias.length; i++) {
    const pagina = referencias[i];
    const esHit  = frames.includes(pagina);
    let paginaExpulsada = null;
    if (esHit) { hits++; } else {
      faults++;
      const libre = frames.indexOf(null);
      if (libre !== -1) { frames[libre] = pagina; cola.push(libre); }
      else {
        const idxV = cola.shift();
        paginaExpulsada = frames[idxV];
        frames[idxV] = pagina; cola.push(idxV);
      }
    }
    pasos.push({ referencia: pagina, frames: [...frames], fault: !esHit, paginaExpulsada });
  }
  return { pasos, faults, hits };
}

/* LRU */
function algoritmoLRU(referencias, numFrames) {
  const frames    = new Array(numFrames).fill(null);
  const ultimoUso = {};
  const pasos     = [];
  let faults = 0, hits = 0;
  for (let i = 0; i < referencias.length; i++) {
    const pagina = referencias[i];
    const esHit  = frames.includes(pagina);
    let paginaExpulsada = null;
    if (esHit) { hits++; } else {
      faults++;
      const libre = frames.indexOf(null);
      if (libre !== -1) { frames[libre] = pagina; } else {
        let minT = Infinity, idxV = 0;
        for (let j = 0; j < numFrames; j++) {
          const t = ultimoUso[frames[j]] ?? -1;
          if (t < minT) { minT = t; idxV = j; }
        }
        paginaExpulsada = frames[idxV]; frames[idxV] = pagina;
      }
    }
    ultimoUso[pagina] = i;
    pasos.push({ referencia: pagina, frames: [...frames], fault: !esHit, paginaExpulsada });
  }
  return { pasos, faults, hits };
}

/* OPT */
function algoritmoOPT(referencias, numFrames) {
  const frames = new Array(numFrames).fill(null);
  const pasos  = [];
  let faults = 0, hits = 0;
  for (let i = 0; i < referencias.length; i++) {
    const pagina = referencias[i];
    const esHit  = frames.includes(pagina);
    let paginaExpulsada = null;
    if (esHit) { hits++; } else {
      faults++;
      const libre = frames.indexOf(null);
      if (libre !== -1) { frames[libre] = pagina; } else {
        let maxD = -1, idxV = 0;
        for (let j = 0; j < numFrames; j++) {
          const prox = referencias.indexOf(frames[j], i + 1);
          const dist = prox === -1 ? Infinity : prox;
          if (dist > maxD) { maxD = dist; idxV = j; }
        }
        paginaExpulsada = frames[idxV]; frames[idxV] = pagina;
      }
    }
    pasos.push({ referencia: pagina, frames: [...frames], fault: !esHit, paginaExpulsada });
  }
  return { pasos, faults, hits };
}

/* CLOCK */
function algoritmoClock(referencias, numFrames) {
  const frames  = new Array(numFrames).fill(null);
  const refBit  = new Array(numFrames).fill(0);
  let manecilla = 0;
  const pasos   = [];
  let faults = 0, hits = 0;
  for (let i = 0; i < referencias.length; i++) {
    const pagina = referencias[i];
    const idxHit = frames.indexOf(pagina);
    const esHit  = idxHit !== -1;
    let paginaExpulsada = null;
    if (esHit) { hits++; refBit[idxHit] = 1; } else {
      faults++;
      while (refBit[manecilla] === 1) { refBit[manecilla] = 0; manecilla = (manecilla + 1) % numFrames; }
      paginaExpulsada = frames[manecilla];
      frames[manecilla] = pagina; refBit[manecilla] = 1;
      manecilla = (manecilla + 1) % numFrames;
    }
    pasos.push({ referencia: pagina, frames: [...frames], fault: !esHit, paginaExpulsada, refBits: [...refBit], manecilla });
  }
  return { pasos, faults, hits };
}

/* SEGUNDA OPORTUNIDAD */
function simularSegundaOportunidad(referencias, numFrames) {
  const frames = new Array(numFrames).fill(null);
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
      const entry = cola.find(e => e.frameIdx === idxHit);
      if (entry) entry.refBit = 1;
    } else {
      faults++;
      const libre = frames.indexOf(null);
      if (libre !== -1) { frames[libre] = pagina; cola.push({ frameIdx: libre, refBit: 0 }); }
      else {
        while (cola[0].refBit === 1) { const e = cola.shift(); e.refBit = 0; cola.push(e); }
        const victima = cola.shift();
        paginaExpulsada = frames[victima.frameIdx];
        frames[victima.frameIdx] = pagina;
        cola.push({ frameIdx: victima.frameIdx, refBit: 0 });
      }
    }
    const scBits = new Array(numFrames).fill(0);
    cola.forEach(e => { scBits[e.frameIdx] = e.refBit; });
    pasos.push({ referencia: pagina, frames: [...frames], fault: !esHit, paginaExpulsada, refBits: scBits });
  }
  return { pasos, faults, hits };
}

/* ----------------------------------------------------------
   CONSTRUCCIÓN DE MARCOS
   ---------------------------------------------------------- */
function construirMarcos(frames, framesPrev, fault, refActual) {
  return frames.map((pagina, i) => {
    if (pagina === null) return { indice: i, pagina: null, estado: "empty" };
    let estado = "used";
    if (fault && pagina === refActual) {
      const entroAqui = !framesPrev || framesPrev[i] !== pagina;
      if (entroAqui) estado = (framesPrev && framesPrev[i] !== null) ? "evicted" : "fault";
    } else if (!fault && pagina === refActual) {
      estado = "hit";
    }
    return { indice: i, pagina, estado };
  });
}

/* ----------------------------------------------------------
   RENDER SALA DE CINE — Asientos
   ---------------------------------------------------------- */
function renderSala(marcos, paso) {
  const grid = document.getElementById("seats-grid");
  if (!grid) return;

  const n = marcos.length;
  if (n === 0) { grid.innerHTML = '<div class="cinema-placeholder">Sin marcos configurados.</div>'; return; }

  const esClockSC  = algoritmoActivo === "clock" || algoritmoActivo === "sc";
  const manecilla  = (paso && paso.manecilla !== undefined) ? paso.manecilla : -1;

  // Dividir en filas de 4
  const cols = 4;
  const filas = [];
  for (let i = 0; i < n; i += cols) filas.push(marcos.slice(i, i + cols));

  grid.innerHTML = filas.map((fila) => {
    const tienePasillo = fila.length > 2;
    const left  = tienePasillo ? fila.slice(0, 2) : fila;
    const right = tienePasillo ? fila.slice(2) : [];

    const PERSON_SVG = `<svg class="seat-person-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="4"/><path d="M5 21v-2a5.5 5.5 0 0 1 11 0v2"/></svg>`;

    const renderSeat = (m) => {
      const usher = (esClockSC && manecilla === m.indice)
        ? `<div class="usher-pointer">▼ aquí</div>` : "";
      const refBitEl = (paso && paso.refBits && esClockSC)
        ? `<span class="seat-ref-bit seat-ref-bit-${paso.refBits[m.indice] === 1 ? "on" : "off"}">R:${paso.refBits[m.indice]}</span>` : "";
      const occupied = m.pagina !== null;
      const personEl = occupied ? PERSON_SVG : "";
      const numEl    = occupied ? `<span class="seat-page-num">${m.pagina}</span>` : "";
      return `
        <div class="seat seat-${m.estado}">
          ${usher}
          <div class="seat-back">${personEl}${numEl}${refBitEl}</div>
          <div class="seat-cushion"></div>
          <div class="seat-frame-label">Marco ${m.indice}</div>
        </div>`;
    };

    const leftHTML  = left.map(renderSeat).join("");
    const rightHTML = right.map(renderSeat).join("");
    const aisleHTML = tienePasillo ? `<div class="seat-aisle"></div>` : "";

    return `<div class="seat-row ${tienePasillo ? "has-aisle" : ""}">${leftHTML}${aisleHTML}${rightHTML}</div>`;
  }).join("");
}

/* ----------------------------------------------------------
   RENDER FILA DE ESPERA
   ---------------------------------------------------------- */
function renderQueueStrip(idxActual) {
  const strip = document.getElementById("queue-strip");
  if (!strip || cadenaReferencias.length === 0) return;

  // Solo las páginas que aún van a entrar (fila de espera real)
  const upcoming = cadenaReferencias.slice(idxActual + 1, idxActual + 12);

  if (upcoming.length === 0) {
    strip.innerHTML = `<span style="font-size:11px;color:#2A4060;font-style:italic;">¡Todos entraron a la sala!</span>`;
    return;
  }

  const BUBBLE_PERSON = `<svg class="person-bubble-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M6 21v-1a5 5 0 0 1 10 0v1"/></svg>`;

  strip.innerHTML = upcoming.map((ref, i) => {
    const isNext  = i === 0;
    const alpha   = Math.max(0.18, 1 - i * 0.075);
    return `<div class="person-bubble ${isNext ? "person-bubble-next" : ""}" style="opacity:${alpha}" title="Próxima: página ${ref}">${BUBBLE_PERSON}<span class="person-bubble-num">${ref}</span></div>`;
  }).join("");
}

/* ----------------------------------------------------------
   RENDER TIRA DE PELÍCULA (footer)
   ---------------------------------------------------------- */
function renderFilmStrip(idxActual) {
  const strip = document.getElementById("film-strip");
  if (!strip || cadenaReferencias.length === 0) return;

  const HOLES = `<div class="film-holes"><div class="film-hole"></div><div class="film-hole"></div></div>`;

  strip.innerHTML = cadenaReferencias.map((ref, i) => {
    let cls = "film-frame";
    if (i === idxActual)    cls += " film-frame-active";
    else if (i < idxActual) cls += historial[i]?.fault ? " film-frame-fault" : " film-frame-hit";
    return `<div class="${cls}" onclick="mostrarPaso(${i})" title="Paso ${i + 1}">${HOLES}<div class="film-frame-body">${ref}</div>${HOLES}</div>`;
  }).join("");

  const active = strip.querySelector(".film-frame-active");
  if (active) active.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
}

/* ----------------------------------------------------------
   RENDER BITS DE REFERENCIA (Clock / SC)
   ---------------------------------------------------------- */
function renderRefBits(paso) {
  const area = document.getElementById("refbits-area");
  const row  = document.getElementById("refbits-row");
  if (!area || !row) return;

  if (paso && paso.refBits && (algoritmoActivo === "clock" || algoritmoActivo === "sc")) {
    area.style.display = "block";
    const bits = paso.refBits;
    const man  = paso.manecilla;
    row.innerHTML = bits.map((b, i) => `
      <div class="refbit-cell refbit-${b === 1 ? "on" : "off"} ${man === i ? "refbit-ptr" : ""}">
        <div class="refbit-idx">#${i}</div>
        <div class="refbit-val">${b}</div>
      </div>`).join("");
  } else {
    area.style.display = "none";
  }
}

/* ----------------------------------------------------------
   NARRADOR DINÁMICO
   ---------------------------------------------------------- */
const NARRATIVAS = {
  fifo: {
    fault_evict:  (p, exp) => `La página ${p} quiere entrar... no hay lugar. El acomodador saca a la página ${exp}, que lleva más tiempo sentada.`,
    fault_free:   (p)      => `La página ${p} entra al primer asiento libre. ¡Bienvenida!`,
    hit:          (p, m)   => `La página ${p} ya está sentada en el asiento ${m}. El acomodador no tiene que hacer nada.`,
  },
  lru: {
    fault_evict:  (p, exp) => `La página ${p} llega y no hay lugar. Con sus anteojos de memoria, el acomodador saca a la página ${exp}: la más antigua sin usar.`,
    fault_free:   (p)      => `La página ${p} ocupa un asiento vacío. El acomodador la registra en su memoria.`,
    hit:          (p, m)   => `La página ${p} ya está en el asiento ${m}. El acomodador anota que fue vista recientemente.`,
  },
  opt: {
    fault_evict:  (p, exp) => `La página ${p} necesita entrar. El acomodador consulta su pergamino y expulsa a la página ${exp}: la que tardará más en volver.`,
    fault_free:   (p)      => `La página ${p} ocupa un asiento vacío. El futuro indica que esta es la mejor posición.`,
    hit:          (p, m)   => `La página ${p} ya está en el asiento ${m}. El futuro confirma que fue correcta esa decisión.`,
  },
  clock: {
    fault_evict:  (p, exp) => `La linterna del acomodador gira y encuentra a la página ${exp} con bit=0. ¡Expulsada! La página ${p} toma su lugar.`,
    fault_free:   (p)      => `La página ${p} entra al asiento vacío. La manecilla del reloj avanza.`,
    hit:          (p, m)   => `La página ${p} ya está en el asiento ${m}. Su bit de referencia se enciende: ¡tiene segunda oportunidad!`,
  },
  sc: {
    fault_evict:  (p, exp) => `La página ${exp} pierde su segunda oportunidad. La mano del acomodador señala su salida. La página ${p} entra.`,
    fault_free:   (p)      => `La página ${p} ocupa un asiento libre y se une a la fila de segunda oportunidad.`,
    hit:          (p, m)   => `La página ${p} ya está en el asiento ${m}. ¡El acomodador le levanta la mano: segunda oportunidad activada!`,
  },
};

function actualizarNarrador(paso) {
  const el   = document.getElementById("narrator-text");
  const icon = document.getElementById("narrator-icon");
  if (!el) return;

  const narr = NARRATIVAS[algoritmoActivo] || NARRATIVAS.fifo;
  let texto, clase;

  if (paso.fault) {
    if (paso.paginaExpulsada !== null && paso.paginaExpulsada !== undefined) {
      texto = narr.fault_evict(paso.referencia, paso.paginaExpulsada);
    } else {
      texto = narr.fault_free(paso.referencia);
    }
    clase = "narrator-fault";
    icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="#FF6B6B"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
  } else {
    const marcoIdx = paso.frames.indexOf(paso.referencia);
    texto = narr.hit(paso.referencia, marcoIdx);
    clase = "narrator-hit";
    icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7BC67E" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  }

  el.style.opacity = "0";
  setTimeout(() => {
    el.textContent = texto;
    el.className = clase;
    el.style.opacity = "1";
  }, 150);
}

/* ----------------------------------------------------------
   ACOMODADOR — actualizar personalidad según algoritmo
   ---------------------------------------------------------- */
const USHER_DATA = {
  fifo:  { cls: "usher-fifo",  desc: "FIFO\nel guardián\ndel tiempo",       acc: "🕐" },
  lru:   { cls: "usher-lru",   desc: "LRU\nel de buena\nmemoria",           acc: "🕶️" },
  opt:   { cls: "usher-opt",   desc: "ÓPTIMO\nel que conoce\nel futuro",    acc: "📜" },
  clock: { cls: "usher-clock", desc: "CLOCK\nel del reloj\ninterminable",   acc: "🔄" },
  sc:    { cls: "usher-sc",    desc: "2da OPORT.\nel misericordioso",        acc: "✋" },
};

const ALGO_SCREEN = {
  fifo:  { name: "FIFO",           tagline: "El acomodador saca al que lleva más tiempo sentado" },
  lru:   { name: "LRU",            tagline: "El acomodador saca al que menos fue visto recientemente" },
  opt:   { name: "ÓPTIMO",         tagline: "El acomodador consulta su pergamino del futuro" },
  clock: { name: "CLOCK",          tagline: "La linterna gira buscando al de bit cero" },
  sc:    { name: "2DA OPORT.",     tagline: "El acomodador da una segunda chance antes de expulsar" },
};

function actualizarAcomodador(algo) {
  const data = USHER_DATA[algo] || USHER_DATA.fifo;
  const fig  = document.getElementById("usher-figure");
  const desc = document.getElementById("usher-desc");
  if (fig) {
    fig.className = `usher-figure ${data.cls}`;
  }
  if (desc) desc.textContent = data.desc.replace(/\n/g, "\n");

  // Pantalla
  const sd = ALGO_SCREEN[algo] || ALGO_SCREEN.fifo;
  const nameEl = document.getElementById("screen-algo-name");
  const tagEl  = document.getElementById("screen-algo-tagline");
  if (nameEl) nameEl.textContent = sd.name;
  if (tagEl)  tagEl.textContent  = sd.tagline;
}

/* ----------------------------------------------------------
   FLASH DE FALLO — parpadeo rojo de la sala
   ---------------------------------------------------------- */
function triggerFaultFlash() {
  const el    = document.getElementById("fault-flash");
  const cinema = document.getElementById("memory-cinema");
  if (el) {
    el.classList.remove("active");
    void el.offsetWidth;
    el.classList.add("active");
    setTimeout(() => el.classList.remove("active"), 450);
  }
  if (cinema) {
    cinema.classList.remove("fault-shake");
    void cinema.offsetWidth;
    cinema.classList.add("fault-shake");
    setTimeout(() => cinema.classList.remove("fault-shake"), 400);
  }
}

/* ----------------------------------------------------------
   BUMP ANIMACIÓN EN CONTADORES
   ---------------------------------------------------------- */
function bumpCounter(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("cnt-bump");
  void el.offsetWidth;
  el.classList.add("cnt-bump");
  setTimeout(() => el.classList.remove("cnt-bump"), 400);
}

/* ----------------------------------------------------------
   MOSTRAR PASO
   ---------------------------------------------------------- */
function mostrarPaso(idx) {
  if (historial.length === 0) return;
  const paso = historial[idx];
  const prev = idx > 0 ? historial[idx - 1] : null;

  // Construir y renderizar asientos
  marcos = construirMarcos(paso.frames, prev ? prev.frames : null, paso.fault, paso.referencia);
  renderSala(marcos, paso);

  // Referencia actual en sidebar
  const refNum = document.getElementById("current-ref-num");
  if (refNum) {
    refNum.textContent = paso.referencia;
    refNum.className   = `current-ref-num ${paso.fault ? "fault" : "hit"}`;
  }
  const refBadge = document.getElementById("current-ref-badge");
  if (refBadge) {
    if (paso.fault) {
      const ev = paso.paginaExpulsada !== null && paso.paginaExpulsada !== undefined;
      refBadge.innerHTML = `<span style="color:#FF8080; font-size:9px; font-weight:700;">PAGE FAULT${ev ? " — expulsó pág. " + paso.paginaExpulsada : " — marco libre"}</span>`;
    } else {
      refBadge.innerHTML = `<span style="color:#7BC67E; font-size:9px; font-weight:700;">HIT ✓</span>`;
    }
  }

  // Contadores
  const faultsSoFar = historial.slice(0, idx + 1).filter(p => p.fault).length;
  const hitsSoFar   = historial.slice(0, idx + 1).filter(p => !p.fault).length;
  const cntF = document.getElementById("cnt-faults");
  const cntH = document.getElementById("cnt-hits");
  if (cntF && cntF.textContent !== String(faultsSoFar)) {
    cntF.textContent = faultsSoFar;
    bumpCounter("cnt-faults");
  }
  if (cntH && cntH.textContent !== String(hitsSoFar)) {
    cntH.textContent = hitsSoFar;
    bumpCounter("cnt-hits");
  }

  // Narrador
  actualizarNarrador(paso);

  // Flash en page fault / hit
  if (paso.fault) {
    triggerFaultFlash();
    tocarAlarma();
  } else {
    const hf = document.getElementById("hit-flash");
    if (hf) {
      hf.classList.remove("active");
      void hf.offsetWidth;
      hf.classList.add("active");
      setTimeout(() => hf.classList.remove("active"), 400);
    }
  }

  // Bits de referencia
  renderRefBits(paso);

  // Cadena visual (fila de espera + tira de película)
  renderQueueStrip(idx);
  renderFilmStrip(idx);

  // Contador de paso
  const counter = document.getElementById("pb-counter");
  if (counter) counter.textContent = `${idx + 1} / ${historial.length}`;

  // Barra de progreso
  const fill = document.getElementById("pb-progress-fill");
  if (fill) fill.style.width = ((idx + 1) / historial.length * 100) + "%";

  pasoActual = idx;
  actualizarBotonesStep();
}

/* ----------------------------------------------------------
   BOTONES STEP
   ---------------------------------------------------------- */
function actualizarBotonesStep() {
  const atI = pasoActual <= 0;
  const atF = pasoActual >= historial.length - 1;
  ["pb-prev","pb-first"].forEach(id => { const b = document.getElementById(id); if (b) b.disabled = atI; });
  ["pb-next","pb-last"].forEach(id  => { const b = document.getElementById(id); if (b) b.disabled = atF; });
}

function siguientePaso() { if (pasoActual < historial.length - 1) mostrarPaso(pasoActual + 1); }
function anteriorPaso()  { if (pasoActual > 0)                   mostrarPaso(pasoActual - 1); }
function primerPaso()    { mostrarPaso(0); }
function ultimoPaso()    { mostrarPaso(historial.length - 1); }

/* ----------------------------------------------------------
   AUTO-PLAY
   ---------------------------------------------------------- */
function simularTodo() {
  if (historial.length === 0) { mostrarToast("Primero presiona Simular.", "error"); return; }
  if (autoPlayInterval) { detenerSimulacion(); return; }
  if (pasoActual >= historial.length - 1) mostrarPaso(0);

  _setPlayState(true);

  const vel = parseInt(document.getElementById("vel-slider")?.value || "700", 10);
  const delay = Math.max(200, 2200 - vel);

  autoPlayInterval = setInterval(() => {
    if (pasoActual >= historial.length - 1) {
      detenerSimulacion();
      mostrarEndScreen();
      return;
    }
    mostrarPaso(pasoActual + 1);
  }, delay);
}

function detenerSimulacion() {
  if (autoPlayInterval) { clearInterval(autoPlayInterval); autoPlayInterval = null; }
  _setPlayState(false);
}

function _setPlayState(playing) {
  const btn   = document.getElementById("pb-play");
  const icon  = document.getElementById("pb-play-icon");
  const label = document.getElementById("pb-play-label");
  if (!btn) return;
  if (playing) {
    btn.classList.add("playing");
    if (icon)  icon.innerHTML = `<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>`;
    if (label) label.textContent = "Stop";
  } else {
    btn.classList.remove("playing");
    if (icon)  icon.innerHTML = `<polygon points="5 3 19 12 5 21 5 3"/>`;
    if (label) label.textContent = "Play";
  }
}

/* ----------------------------------------------------------
   PANTALLA FINAL
   ---------------------------------------------------------- */
function mostrarEndScreen() {
  const endEl = document.getElementById("cinema-end-screen");
  if (!endEl) return;

  const total  = cadenaReferencias.length;
  const faults = historial.filter(p => p.fault).length;
  const hits   = historial.filter(p => !p.fault).length;
  const tasa   = (hits / total * 100).toFixed(1);

  // Rating
  const hitRate = hits / total;
  let rating = "Excelente";
  if (hitRate < 0.2)      rating = "Muy pocos aciertos";
  else if (hitRate < 0.4) rating = "Regular";
  else if (hitRate < 0.6) rating = "Bueno";
  else if (hitRate < 0.8) rating = "Muy bueno";

  const subEl   = document.getElementById("end-subtitle");
  const statsEl = document.getElementById("end-stats");
  const ratEl   = document.getElementById("end-rating");

  if (subEl)   subEl.textContent = `Algoritmo: ${_nombreAlgo(algoritmoActivo)} — ${total} referencias, ${configMemoria.frames} marcos`;
  if (statsEl) statsEl.innerHTML = `
    <div class="end-stat"><div class="end-stat-val fault">${faults}</div><div class="end-stat-lbl">Page Faults</div></div>
    <div class="end-stat"><div class="end-stat-val good">${hits}</div><div class="end-stat-lbl">Hits</div></div>
    <div class="end-stat"><div class="end-stat-val">${tasa}%</div><div class="end-stat-lbl">Tasa de aciertos</div></div>`;
  if (ratEl) ratEl.textContent = rating;

  endEl.style.display = "flex";
}

function cerrarEndScreen() {
  const endEl = document.getElementById("cinema-end-screen");
  if (endEl) endEl.style.display = "none";
}

/* ----------------------------------------------------------
   FUNCIÓN PRINCIPAL — iniciarSimulacion()
   ---------------------------------------------------------- */
function iniciarSimulacion() {
  detenerSimulacion();
  cerrarEndScreen();

  const numFrames = parseInt(document.getElementById("inp-frames").value,   10);
  const pageSize  = parseInt(document.getElementById("inp-pagesize").value, 10);
  const memoria   = parseInt(document.getElementById("inp-memoria").value,  10);
  const refStr    = document.getElementById("inp-referencias").value.trim();

  if (isNaN(numFrames) || numFrames < 1) { mostrarToast("El número de marcos debe ser ≥ 1.", "error"); return; }
  if (isNaN(pageSize)  || pageSize  < 1) { mostrarToast("El tamaño de página debe ser ≥ 1.", "error"); return; }
  if (isNaN(memoria)   || memoria   < 1) { mostrarToast("El tamaño de memoria debe ser ≥ 1.", "error"); return; }
  if (!refStr) { mostrarToast("Ingresa una cadena de referencias", "error"); return; }

  const refs = refStr.split(/\s+/).map(Number).filter(n => !isNaN(n) && n >= 0);
  if (refs.length === 0) { mostrarToast("La cadena de referencias no es válida.", "error"); return; }

  cadenaReferencias = refs;
  configMemoria     = { frames: numFrames, pageSize, memoria };

  const resultado = simularPaginacion(cadenaReferencias, numFrames, algoritmoActivo);
  historial  = resultado.pasos;
  pasoActual = 0;

  // Métricas globales
  const ultimoPaso = resultado.pasos[resultado.pasos.length - 1];
  const usados     = ultimoPaso ? ultimoPaso.frames.filter(p => p !== null).length : 0;
  const total      = cadenaReferencias.length;
  const tasa       = (resultado.faults / total * 100);

  _renderMetricasDark([
    { lbl: "Page Faults",    val: resultado.faults,     cls: "fault" },
    { lbl: "Page Hits",      val: resultado.hits,       cls: "good"  },
    { lbl: "Tasa de fallos", val: fmt(tasa, 1) + "%",   cls: ""      },
    { lbl: "Marcos usados",  val: `${usados}/${numFrames}`, cls: "" },
  ]);

  // Mostrar playback bar
  document.getElementById("playback-bar").style.display = "flex";
  document.getElementById("cnt-faults").textContent = "0";
  document.getElementById("cnt-hits").textContent   = "0";

  mostrarPaso(0);
  mostrarToast("¡Función comenzada!", "success");

  // Actualizar comparación si está visible
  if (document.getElementById("seccion-comparacion").style.display !== "none") {
    mostrarComparacion();
  }
}

function _renderMetricasDark(items) {
  const el = document.getElementById("metricas-paginacion");
  if (!el) return;
  el.innerHTML = items.map(item => `
    <div class="mcard">
      <div class="mcard-lbl">${item.lbl}</div>
      <div class="mcard-val ${item.cls}">${item.val}</div>
    </div>`).join("");
}

/* ----------------------------------------------------------
   SELECCIÓN DE ALGORITMO
   ---------------------------------------------------------- */
function seleccionarAlgoritmo(nombre) {
  algoritmoActivo = nombre;

  // Botones del panel
  document.querySelectorAll(".algo-card").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.algo === nombre);
  });

  // Descripción textual
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

  // Acomodador + pantalla del cine
  actualizarAcomodador(nombre);

  mostrarToast("Acomodador cambiado: " + _nombreAlgo(nombre), "info");
}

/* ----------------------------------------------------------
   COMPARACIÓN DE ALGORITMOS
   ---------------------------------------------------------- */
function mostrarComparacion() {
  if (cadenaReferencias.length === 0) { mostrarToast("Ingresa una cadena de referencias", "error"); return; }

  const nf = configMemoria.frames || parseInt(document.getElementById("inp-frames").value, 10) || 3;
  const total = cadenaReferencias.length;
  const algos = ["fifo","lru","opt","clock","sc"];

  const resultados = algos.map(a => {
    const r = simularPaginacion(cadenaReferencias, nf, a);
    return { algo: a, nombre: _nombreAlgo(a), faults: r.faults, hits: r.hits };
  });

  const minF = Math.min(...resultados.map(r => r.faults));
  const maxF = Math.max(...resultados.map(r => r.faults));

  const tablaEl = document.getElementById("comparacion-tabla");
  if (tablaEl) {
    tablaEl.innerHTML = resultados.map(r => {
      const esMejor  = r.faults === minF;
      const esPeor   = r.faults === maxF && maxF !== minF;
      const barW     = maxF > 0 ? (r.faults / maxF * 100).toFixed(1) : 0;
      const faultPct = (r.faults / total * 100).toFixed(1);
      return `
        <div class="comp-row ${esMejor ? "comp-best" : esPeor ? "comp-worst" : ""}">
          <div class="comp-nombre">${r.nombre}</div>
          <div class="comp-bar-wrap">
            <div class="comp-bar ${esMejor ? "comp-bar-best" : esPeor ? "comp-bar-worst" : ""}" style="width:${barW}%"></div>
          </div>
          <div class="comp-stats">
            <span class="comp-faults">${r.faults} fallos</span>
            <span class="comp-hits">${r.hits} hits</span>
            <span class="comp-rate">${faultPct}%</span>
          </div>
          <div style="display:flex; justify-content:flex-end;">
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
   RESET
   ---------------------------------------------------------- */
function resetearSimulacion() {
  detenerSimulacion();
  cerrarEndScreen();

  marcos = []; historial = []; pasoActual = 0;
  cadenaReferencias = []; configMemoria = {};

  document.getElementById("seats-grid").innerHTML   = '<div class="cinema-placeholder">Configura y presiona Simular.</div>';
  document.getElementById("queue-strip").innerHTML  = '<div class="cinema-placeholder">Aún no hay simulación.</div>';
  document.getElementById("film-strip").innerHTML   = '<div class="cinema-placeholder" style="padding:4px 0;">Sin referencias.</div>';
  document.getElementById("cnt-faults").textContent = "0";
  document.getElementById("cnt-hits").textContent   = "0";
  document.getElementById("current-ref-num").textContent = "—";
  document.getElementById("current-ref-num").className   = "current-ref-num";
  document.getElementById("current-ref-badge").innerHTML = "";
  document.getElementById("narrator-text").textContent = "Configura la memoria y presiona Simular para comenzar la función.";
  document.getElementById("narrator-text").className   = "";
  document.getElementById("narrator-icon").innerHTML   = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7090B0" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
  document.getElementById("pb-progress-fill").style.width = "0%";
  document.getElementById("playback-bar").style.display = "none";
  document.getElementById("refbits-area").style.display = "none";
  document.getElementById("seccion-comparacion").style.display = "none";
  document.getElementById("pb-counter").textContent = "— / —";
  _renderMetricasDark([
    { lbl: "Page Faults", val: "—", cls: "" }, { lbl: "Page Hits", val: "—", cls: "" },
    { lbl: "Tasa fallos", val: "—", cls: "" }, { lbl: "Marcos usados", val: "—", cls: "" },
  ]);

  mostrarToast("Simulación reiniciada.", "info");
}

/* ----------------------------------------------------------
   HELPERS
   ---------------------------------------------------------- */
function _nombreAlgo(algo) {
  return { fifo:"FIFO", lru:"LRU", opt:"Óptimo", clock:"Clock", sc:"2da Oportunidad" }[algo] ?? algo.toUpperCase();
}

function fmt(n, dec) { return Number(n).toFixed(dec); }

/* ----------------------------------------------------------
   ALARMA SONORA
   ---------------------------------------------------------- */
function tocarAlarma() {
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window["webkitAudioContext"])();
    const osc  = _audioCtx.createOscillator();
    const gain = _audioCtx.createGain();
    osc.connect(gain); gain.connect(_audioCtx.destination);
    osc.type = "square";
    osc.frequency.setValueAtTime(440, _audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(220, _audioCtx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.06, _audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + 0.18);
    osc.start(_audioCtx.currentTime); osc.stop(_audioCtx.currentTime + 0.18);
  } catch (_) {}
}

/* ----------------------------------------------------------
   CARGA DESDE ARCHIVO
   ---------------------------------------------------------- */
function cargarArchivoMemoria() { document.getElementById("file-input-memoria").click(); }

function onArchivoMemoriaSeleccionado(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const { config, errores } = parsearArchivoMemoria(e.target.result);
    if (errores.length > 0) { mostrarToast("Error en archivo: " + errores[0], "error"); return; }
    if (config.frames     !== undefined) document.getElementById("inp-frames").value      = config.frames;
    if (config.pagesize   !== undefined) document.getElementById("inp-pagesize").value    = config.pagesize;
    if (config.memoria    !== undefined) document.getElementById("inp-memoria").value     = config.memoria;
    if (config.referencias !== undefined) document.getElementById("inp-referencias").value = config.referencias;
    mostrarToast("Configuración cargada desde archivo.", "success");
  };
  reader.readAsText(file);
  event.target.value = "";
}

/* ----------------------------------------------------------
   PARSEAR ARCHIVO (compatible con formato original)
   ---------------------------------------------------------- */
function parsearArchivoMemoria(texto) {
  const config  = {};
  const errores = [];
  const lines   = texto.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#"));
  for (const line of lines) {
    const [key, ...rest] = line.split("=");
    const val = rest.join("=").trim();
    switch (key.trim().toLowerCase()) {
      case "frames":      config.frames      = parseInt(val, 10); break;
      case "pagesize":    config.pagesize    = parseInt(val, 10); break;
      case "memoria":     config.memoria     = parseInt(val, 10); break;
      case "referencias": config.referencias = val; break;
    }
  }
  return { config, errores };
}

/* ----------------------------------------------------------
   INICIALIZACIÓN — al cargar la página
   ---------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  actualizarAcomodador("fifo");
});
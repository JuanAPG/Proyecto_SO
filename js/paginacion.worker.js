/* ============================================================
   OSim — Paginación Web Worker
   Ejecuta algoritmos de reemplazo en un thread independiente.
   Soporta SharedArrayBuffer (memoria compartida) con fallback
   a postMessage si el header COOP/COEP no está activo.
   ============================================================ */

self.onmessage = function (e) {
  const { mode, algoritmo, referencias, marcos, workerId, useShared } = e.data;

  /* Leer cadena desde SharedArrayBuffer o array normal */
  const refs = useShared
    ? Array.from(new Int32Array(referencias))
    : referencias;

  const tStart = performance.now();

  let result;
  if (mode === "simulate") {
    result = _runFull(algoritmo, refs, marcos);
  } else {
    /* mode === "compare": sólo estadísticas, sin pasos */
    const full = _runFull(algoritmo, refs, marcos);
    result = { faults: full.faults, hits: full.hits };
  }

  const elapsed = performance.now() - tStart;

  self.postMessage({ workerId, algoritmo, mode, elapsed, ...result });
};

/* ──────────────────────────────────────────────────────────
   ROUTER
────────────────────────────────────────────────────────── */
function _runFull(algo, refs, frames) {
  switch (algo) {
    case "lru":   return _lru(refs, frames);
    case "opt":   return _opt(refs, frames);
    case "clock": return _clock(refs, frames);
    case "sc":    return _sc(refs, frames);
    default:      return _fifo(refs, frames);
  }
}

/* ──────────────────────────────────────────────────────────
   FIFO
────────────────────────────────────────────────────────── */
function _fifo(referencias, numFrames) {
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
        const idxV = cola.shift();
        paginaExpulsada = frames[idxV];
        frames[idxV]    = pagina;
        cola.push(idxV);
      }
    }
    pasos.push({ referencia: pagina, frames: [...frames], fault: !esHit, paginaExpulsada });
  }
  return { pasos, faults, hits };
}

/* ──────────────────────────────────────────────────────────
   LRU
────────────────────────────────────────────────────────── */
function _lru(referencias, numFrames) {
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
        let minT = Infinity, idxV = 0;
        for (let j = 0; j < numFrames; j++) {
          const t = ultimoUso[frames[j]] ?? -1;
          if (t < minT) { minT = t; idxV = j; }
        }
        paginaExpulsada = frames[idxV];
        frames[idxV]    = pagina;
      }
    }
    ultimoUso[pagina] = i;
    pasos.push({ referencia: pagina, frames: [...frames], fault: !esHit, paginaExpulsada });
  }
  return { pasos, faults, hits };
}

/* ──────────────────────────────────────────────────────────
   OPT
────────────────────────────────────────────────────────── */
function _opt(referencias, numFrames) {
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
        let maxD = -1, idxV = 0;
        for (let j = 0; j < numFrames; j++) {
          const prox = referencias.indexOf(frames[j], i + 1);
          const dist = prox === -1 ? Infinity : prox;
          if (dist > maxD) { maxD = dist; idxV = j; }
        }
        paginaExpulsada = frames[idxV];
        frames[idxV]    = pagina;
      }
    }
    pasos.push({ referencia: pagina, frames: [...frames], fault: !esHit, paginaExpulsada });
  }
  return { pasos, faults, hits };
}

/* ──────────────────────────────────────────────────────────
   CLOCK
────────────────────────────────────────────────────────── */
function _clock(referencias, numFrames) {
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

    if (esHit) {
      hits++;
      refBit[idxHit] = 1;
    } else {
      faults++;
      while (refBit[manecilla] === 1) {
        refBit[manecilla] = 0;
        manecilla = (manecilla + 1) % numFrames;
      }
      paginaExpulsada    = frames[manecilla];
      frames[manecilla]  = pagina;
      refBit[manecilla]  = 1;
      manecilla = (manecilla + 1) % numFrames;
    }
    pasos.push({
      referencia: pagina, frames: [...frames],
      fault: !esHit, paginaExpulsada,
      refBits: [...refBit], manecilla
    });
  }
  return { pasos, faults, hits };
}

/* ──────────────────────────────────────────────────────────
   SEGUNDA OPORTUNIDAD (SC)
────────────────────────────────────────────────────────── */
function _sc(referencias, numFrames) {
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
      if (libre !== -1) {
        frames[libre] = pagina;
        cola.push({ frameIdx: libre, refBit: 0 });
      } else {
        while (cola[0].refBit === 1) {
          const e = cola.shift();
          e.refBit = 0;
          cola.push(e);
        }
        const victima = cola.shift();
        paginaExpulsada         = frames[victima.frameIdx];
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

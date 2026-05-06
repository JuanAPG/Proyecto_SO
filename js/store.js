/* ============================================================
   OSim — Store: Persistencia de pruebas
   Archivo: js/store.js
   Incluir en: scheduling.html, paginacion.html, metricas.html

   Solo guarda los PARÁMETROS de entrada de cada prueba.
   Métricas re-ejecuta el algoritmo en vivo para obtener resultados.
   ============================================================ */

const Store = (() => {
    const KEY_S = 'osim_s_tests';   // scheduling
    const KEY_P = 'osim_p_tests';   // paginación
    const MAX = 50;               // máximo de pruebas por módulo

    /* ── Utilidades de localStorage ── */
    function _load(key) {
        try { return JSON.parse(localStorage.getItem(key)) || []; }
        catch (_) { return []; }
    }
    function _save(key, arr) {
        try { localStorage.setItem(key, JSON.stringify(arr)); }
        catch (_) { console.warn('[Store] No se pudo guardar en localStorage'); }
    }

    /* ── Generar ID único ── */
    function _uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    /* ── API pública ── */

    /**
     * Guarda una prueba de Scheduling.
     * @param {string} algo  - clave del algoritmo: 'fcfs','sjf','rr', etc.
     * @param {Array}  procs - lista de procesos [{pid,arrivalTime,burstTime,priority}]
     * @param {number} quantum - quantum (solo RR; ignorado en otros)
     * @param {string} [name] - nombre opcional; se auto-genera si no se da
     * @returns {object} la prueba guardada
     */
    function saveScheduling(algo, procs, quantum = 2, name = null) {
        const tests = _load(KEY_S);
        const entry = {
            id: _uid(),
            ts: Date.now(),
            name: name || `${algo.toUpperCase()} · ${procs.length} proc`,
            algo,
            quantum,
            // Guardamos solo los campos necesarios para re-ejecutar
            processes: procs.map(p => ({
                pid: p.pid,
                arrivalTime: p.arrivalTime,
                burstTime: p.burstTime,
                priority: p.priority ?? 0,
                state: 'ready',
            })),
        };
        tests.unshift(entry);          // más reciente primero
        if (tests.length > MAX) tests.length = MAX;
        _save(KEY_S, tests);
        return entry;
    }

    /**
     * Guarda una prueba de Paginación.
     * @param {string} algo   - clave: 'fifo','lru','opt','clock','sc'
     * @param {number[]} refs - cadena de referencias
     * @param {number} frames - número de marcos
     * @param {string} [name] - nombre opcional
     * @returns {object} la prueba guardada
     */
    function savePaginacion(algo, refs, frames, name = null) {
        const tests = _load(KEY_P);
        const entry = {
            id: _uid(),
            ts: Date.now(),
            name: name || `${algo.toUpperCase()} · ${refs.length} refs · ${frames}F`,
            algo,
            refs: [...refs],
            frames,
        };
        tests.unshift(entry);
        if (tests.length > MAX) tests.length = MAX;
        _save(KEY_P, tests);
        return entry;
    }

    /** Devuelve todas las pruebas de Scheduling (más recientes primero) */
    function getScheduling() { return _load(KEY_S); }

    /** Devuelve todas las pruebas de Paginación (más recientes primero) */
    function getPaginacion() { return _load(KEY_P); }

    /** Elimina una prueba por id */
    function remove(type, id) {
        const key = type === 's' ? KEY_S : KEY_P;
        const arr = _load(key).filter(t => t.id !== id);
        _save(key, arr);
    }

    /** Borra todas las pruebas de un módulo */
    function clear(type) {
        _save(type === 's' ? KEY_S : KEY_P, []);
    }

    return { saveScheduling, savePaginacion, getScheduling, getPaginacion, remove, clear };
})();
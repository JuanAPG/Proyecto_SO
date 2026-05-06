/* ============================================================
   OSim — Gestión de Procesos
   Archivo: procesos.js
   Descripción: Funciones para captura, validación y manejo de procesos
   ============================================================ */

/**
 * Estado global de procesos
 */
let procesosGlobales = [];
let procesoIdCounter = 1;
let editandoIdx = -1; // índice del proceso en edición (-1 = sin edición)

/* ----------------------------------------------------------
   1. CAPTURA DE PROCESOS DESDE FORM
   ---------------------------------------------------------- */

/**
 * Obtiene los valores del formulario y crea un proceso
 * @returns {Object|null} Proceso válido o null si hay error
 */
<<<<<<< HEAD
function obtenerProcesoDesdeFormula() {
  const nombreInput = document.getElementById("inputName").value.trim();
  const pid = nombreInput || ("P" + procesoIdCounter);
  
  const arrivalTime = parseInt(document.getElementById("inputArrival").value) || 0;
  const burstTime = parseInt(document.getElementById("inputBurst").value);
  const priority = parseInt(document.getElementById("inputPriority").value) || 1;
=======
function obtenerProcesoDesdeFórmula() {
  const pid = parseInt(document.getElementById("inputPid")?.value) || procesoIdCounter;
  const arrivalTime = parseInt(document.getElementById("inputArrival")?.value) || 0;
  const burstTime = parseInt(document.getElementById("inputBurst")?.value);
  const priority = parseInt(document.getElementById("inputPriority")?.value) || 1;
  const type = document.getElementById("inputType")?.value || "fork";
  const pages = parseInt(document.getElementById("inputPages")?.value) || 1;
>>>>>>> d55c422901118b9a12edccf98d00bdad7648cac3

  if (isNaN(burstTime) || burstTime <= 0) {
    alert("Por favor, ingresa un tiempo de ráfaga (Burst) válido.");
    return null;
  }

<<<<<<< HEAD
  const proceso = {
    pid: pid, // Aquí guardamos el nombre
    arrivalTime: arrivalTime,
    burstTime: burstTime,
    remainingTime: burstTime, // Para la animación
    priority: priority,
=======
  const proceso = crearProceso({
    pid,
    arrivalTime,
    burstTime,
    priority,
    type,
    pages,
>>>>>>> d55c422901118b9a12edccf98d00bdad7648cac3
    state: "new",
    color: GANTT_COLORS[procesoIdCounter % GANTT_COLORS.length]
  };

  procesosGlobales.push(proceso);
  if (!nombreInput) procesoIdCounter++; // Solo aumenta si no hubo nombre manual
  
  document.getElementById("inputBurst").value = "";
  document.getElementById("inputName").value = "";
  
  return proceso;
}

/**
 * Abre el formulario en modo edición para el proceso indicado
 */
function editarProceso(idx) {
  const p = procesosGlobales[idx];
  editandoIdx = idx;

  document.getElementById("inputPid").value      = p.pid;
  document.getElementById("inputPid").disabled   = true;
  document.getElementById("inputArrival").value  = p.arrivalTime;
  document.getElementById("inputBurst").value    = p.burstTime;
  document.getElementById("inputPriority").value = p.priority;
  document.getElementById("inputType").value     = p.type || "fork";
  document.getElementById("inputPages").value    = p.pages;

  const btn = document.getElementById("btnAddProcess");
  btn.textContent = "Guardar";
  btn.style.background = "var(--color-blue-700)";

  document.getElementById("btnCancelEdit").style.display = "inline-block";
  document.getElementById("btnClearAll").style.display   = "none";

  document.getElementById("inputBurst").focus();
}

/**
 * Cancela la edición y restaura el formulario
 */
function cancelarEdicion() {
  editandoIdx = -1;
  document.getElementById("inputPid").disabled   = false;

  const btn = document.getElementById("btnAddProcess");
  btn.textContent = "Agregar";
  btn.style.background = "";

  document.getElementById("btnCancelEdit").style.display = "none";
  document.getElementById("btnClearAll").style.display   = "inline-block";

  limpiarFormulario();
}

/**
 * Agrega un proceso a la lista global (o guarda edición)
 */
function agregarProceso() {
  // — Modo edición: actualizar proceso existente
  if (editandoIdx >= 0) {
    const proceso = obtenerProcesoDesdeFormula();
    if (!proceso) return;
    proceso.pid   = procesosGlobales[editandoIdx].pid; // PID no cambia
    proceso.state = procesosGlobales[editandoIdx].state;
    procesosGlobales[editandoIdx] = proceso;
    cancelarEdicion();
    renderizarTablaProcesos();
    return;
  }

  const proceso = obtenerProcesoDesdeFormula();
  if (!proceso) return;

  // Verificar que el PID no exista
  if (procesosGlobales.find((p) => p.pid === proceso.pid)) {
    alert(`PID ${proceso.pid} ya existe`);
    return;
  }

  procesosGlobales.push(proceso);
  procesoIdCounter = Math.max(procesoIdCounter, proceso.pid + 1);

  // Limpiar formulario
  limpiarFormulario();

  // Actualizar tabla visual
  renderizarTablaProcesos();

  // Mostrar panel de ejecución con animación la primera vez
  const panel = document.getElementById("executionPanel");
  if (panel.style.display === "none" || !panel.style.display) {
    panel.style.display = "grid";
    panel.classList.add("panel-enter");
    panel.addEventListener("animationend", () => panel.classList.remove("panel-enter"), { once: true });
  }
  document.getElementById("queueVisualization").style.display = "flex";
}

/**
 * Limpiar formulario
 */
function limpiarFormulario() {
  document.getElementById("inputPid").value = "";
  document.getElementById("inputArrival").value = "0";
  document.getElementById("inputBurst").value = "";
  document.getElementById("inputPriority").value = "1";
  const typeEl = document.getElementById("inputType");
  if (typeEl) typeEl.value = "fork";
  document.getElementById("inputPages").value = "1";
  document.getElementById("inputPid").focus();
}

/**
 * Limpiar todos los procesos
 */
function limpiarTodos() {
  if (procesosGlobales.length === 0) return;
  if (!confirm("¿Eliminar todos los procesos?")) return;

  procesosGlobales = [];
  procesoIdCounter = 1;
  limpiarFormulario();
  renderizarTablaProcesos();
  document.getElementById("executionPanel").style.display = "none";
  document.getElementById("queueVisualization").style.display = "none";
}

/* ----------------------------------------------------------
   2. RENDERIZAR TABLA
   ---------------------------------------------------------- */

/**
 * Renderiza la tabla de procesos en el DOM
 */
function renderizarTablaProcesos() {
  const tbody = document.getElementById("processTableBody");
  tbody.innerHTML = "";

  if (procesosGlobales.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="8" style="text-align:center; color:var(--text-muted);">Sin procesos. Agrega uno arriba.</td></tr>';
    return;
  }

  procesosGlobales.forEach((proceso, idx) => {
    const fila = document.createElement("tr");
    fila.className = "row-enter";
    fila.style.animationDelay = `${idx * 35}ms`;
    fila.style.opacity = "0";
    fila.innerHTML = `
      <td class="td-center">${proceso.pid}</td>
      <td class="td-center">${proceso.arrivalTime}</td>
      <td class="td-center">${proceso.burstTime}</td>
      <td class="td-center">${proceso.priority}</td>
      <td class="td-center">${proceso.pages}</td>
      <td>${badgeTipo(proceso.type || "fork")}</td>
      <td>${badgeEstado(proceso.state)}</td>
      <td style="white-space:nowrap;">
        <button class="btn-edit" onclick="editarProceso(${idx})" title="Editar proceso">✎</button>
        <button class="btn-clear" onclick="eliminarProceso(${idx})" style="padding:4px 8px; font-size:11px;" title="Eliminar proceso">×</button>
      </td>
    `;
    tbody.appendChild(fila);
  });

  // Actualizar queue visualization
  actualizarQueueVisualization();
}

/**
 * Eliminar un proceso de la lista
 */
function eliminarProceso(idx) {
  if (confirm(`¿Eliminar proceso ${procesosGlobales[idx].pid}?`)) {
    procesosGlobales.splice(idx, 1);
    renderizarTablaProcesos();
  }
}

/* ----------------------------------------------------------
   3. CARGA DESDE ARCHIVO
   ---------------------------------------------------------- */

/**
 * Maneja la carga de archivo procesos.txt
 */
function cargarDesdearchivo(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const contenido = e.target.result;
      const lineas = contenido.split("\n").filter((l) => l.trim().length > 0);

      // Saltar header si existe
      let inicio = 0;
      if (lineas[0].toLowerCase().includes("pid")) {
        inicio = 1;
      }

      procesosGlobales = [];
      let contador = 0;

      for (let i = inicio; i < lineas.length; i++) {
        const partes = lineas[i].split(",").map((p) => p.trim());
        if (partes.length < 5) continue;

        const rawType = (partes[5] || "fork").trim().toLowerCase();
        const type = rawType === "thread" ? "thread" : "fork";
        const proceso = crearProceso({
          pid: parseInt(partes[0]),
          arrivalTime: parseInt(partes[1]),
          burstTime: parseInt(partes[2]),
          priority: parseInt(partes[3]),
          pages: parseInt(partes[4]),
          type,
          state: "new",
        });

        const validacion = validarProceso(proceso);
        if (validacion.valido) {
          procesosGlobales.push(proceso);
          contador++;
        }
      }

      alert(`Cargados ${contador} procesos`);
      renderizarTablaProcesos();
      document.getElementById("executionPanel").style.display = "grid";
      document.getElementById("queueVisualization").style.display = "flex";
    } catch (error) {
      alert(`Error al cargar: ${error.message}`);
    }
  };
  reader.readAsText(file);
}

/* ----------------------------------------------------------
   4. ACTUALIZAR VISUALIZACIÓN DE COLA
   ---------------------------------------------------------- */

/**
 * Actualiza la cola visible en el DOM
 */
function actualizarQueueVisualization() {
  const queueItems = document.getElementById("queueItems");
  queueItems.innerHTML = "";

  procesosGlobales
    .sort((a, b) => a.arrivalTime - b.arrivalTime)
    .forEach((p) => {
      const item = document.createElement("div");
      item.className = "queue-item";
      item.textContent = `P${p.pid}`;
      queueItems.appendChild(item);
    });
}

/* ----------------------------------------------------------
   5. EVENT LISTENERS (inicialización)
   ---------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", () => {
  // Botón Agregar
  const btnAdd = document.getElementById("btnAddProcess");
  if (btnAdd) {
    btnAdd.addEventListener("click", agregarProceso);
    // Permitir Enter en los inputs
    document
      .getElementById("inputBurst")
      ?.addEventListener("keypress", (e) => {
        if (e.key === "Enter") agregarProceso();
      });
  }

  // Botón Limpiar
  const btnClear = document.getElementById("btnClearAll");
  if (btnClear) {
    btnClear.addEventListener("click", limpiarTodos);
  }

  // File upload
  const fileInput = document.getElementById("fileInput");
  if (fileInput) {
    fileInput.addEventListener("change", (e) => {
      if (e.target.files[0]) {
        cargarDesdearchivo(e.target.files[0]);
      }
    });
  }

  // Inicializar procesos vacío
  renderizarTablaProcesos();
});

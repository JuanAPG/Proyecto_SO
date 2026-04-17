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

/* ----------------------------------------------------------
   1. CAPTURA DE PROCESOS DESDE FORM
   ---------------------------------------------------------- */

/**
 * Obtiene los valores del formulario y crea un proceso
 * @returns {Object|null} Proceso válido o null si hay error
 */
function obtenerProcesoDesdeFórmula() {
  const pid = parseInt(document.getElementById("inputPid")?.value) || procesoIdCounter;
  const arrivalTime = parseInt(document.getElementById("inputArrival")?.value) || 0;
  const burstTime = parseInt(document.getElementById("inputBurst")?.value);
  const priority = parseInt(document.getElementById("inputPriority")?.value) || 1;
  const pages = parseInt(document.getElementById("inputPages")?.value) || 1;

  if (!burstTime || burstTime <= 0) {
    alert("Burst Time es requerido y debe ser > 0");
    return null;
  }

  const proceso = crearProceso({
    pid,
    arrivalTime,
    burstTime,
    priority,
    pages,
    state: "new",
  });

  const validacion = validarProceso(proceso);
  if (!validacion.valido) {
    alert("Error en proceso:\n" + validacion.errores.join("\n"));
    return null;
  }

  return proceso;
}

/**
 * Agrega un proceso a la lista global
 */
function agregarProceso() {
  const proceso = obtenerProcesoDesdeFórmula();
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

  // Mostrar panel de ejecución
  document.getElementById("executionPanel").style.display = "grid";
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
      '<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">Sin procesos. Agrega uno arriba.</td></tr>';
    return;
  }

  procesosGlobales.forEach((proceso, idx) => {
    const fila = document.createElement("tr");
    fila.innerHTML = `
      <td class="td-center">${proceso.pid}</td>
      <td class="td-center">${proceso.arrivalTime}</td>
      <td class="td-center">${proceso.burstTime}</td>
      <td class="td-center">${proceso.priority}</td>
      <td class="td-center">${proceso.pages}</td>
      <td>${badgeEstado(proceso.state)}</td>
      <td>
        <button class="btn-clear" onclick="eliminarProceso(${idx})" style="padding:4px 8px; font-size:11px;">×</button>
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

        const proceso = crearProceso({
          pid: parseInt(partes[0]),
          arrivalTime: parseInt(partes[1]),
          burstTime: parseInt(partes[2]),
          priority: parseInt(partes[3]),
          pages: parseInt(partes[4]),
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

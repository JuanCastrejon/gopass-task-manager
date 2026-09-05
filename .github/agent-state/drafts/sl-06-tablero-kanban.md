## Contexto & Problem Statement

Con la infraestructura de base de datos relacional y los endpoints REST de tareas completamente operativos y verificados bajo PostgreSQL (SL-05), los usuarios operativos requieren una interfaz visual de alto rendimiento para gestionar el flujo de trabajo de sus proyectos. 

Actualmente, la vista de detalle de proyecto (`/projects/:id`) cuenta únicamente con los indicadores de avance y la edición de cabecera. Es necesario implementar el **Tablero Kanban interactivo de tres columnas** (`TODO`, `IN_PROGRESS`, `DONE`), permitiendo la creación, edición, transiciones de estado unidireccionales/bidireccionales y eliminación de tareas, junto con un sistema robusto de búsqueda y filtrado de prioridades cuyos estados se reflejen de forma bidireccional y sin recarga en los parámetros de la URL.

## Requisitos Funcionales Vinculados

- **RF-06:** Creación de tareas asociadas a un proyecto (`title` obligatorio, `description` opcional, `priority` y `status`).
- **RF-08:** Listado y visualización de tareas organizadas visualmente en columnas por estado (`TODO`, `IN_PROGRESS`, `DONE`).
- **RF-09:** Visualización de detalles de cada tarjeta (título, descripción, badge de prioridad y fecha).
- **RF-10:** Transición rápida de estados entre columnas manteniendo consistencia de datos y actualización inmediata de la barra de avance.
- **RF-11:** Eliminación de tareas con confirmación explícita para prevenir borrados accidentales.
- **RF-13:** Búsqueda textual por título con rebote (debounce) y filtrado por prioridad (`LOW`, `MEDIUM`, `HIGH`) sincronizados con la URL (`?priority=...&q=...`).

---

## User Stories & Acceptance Criteria

### US-01: Tablero Kanban Multi-Columna y Visualización de Tareas (RF-08, RF-09)
*Como líder técnico u operador de proyectos,*
*quiero visualizar las tareas asignadas organizadas en columnas según su estado operativo,*
*para tener una visión espacial clara de la carga de trabajo y el progreso actual.*

- **AC-01.1:** El tablero renderiza 3 columnas estables: **Por hacer** (`TODO`), **En progreso** (`IN_PROGRESS`) y **Completadas** (`DONE`).
- **AC-01.2:** Cada columna muestra un contador de tareas en su cabecera y un botón directo para añadir tareas preseleccionando dicho estado.
- **AC-01.3:** Las tarjetas de tareas (`TaskCard`) renderizan el título, descripción truncada legible, badge de prioridad con código de color semántico y controles de acción rápida.
- **AC-01.4:** Si una columna no tiene tareas coincidentes, muestra un estado vacío contextualizado sin romper la grilla de las demás columnas.

### US-02: Transición de Estados y Foco Accesible (RF-10)
*Como usuario que interactúa intensivamente mediante teclado y ratón,*
*quiero transicionar tareas entre estados con un solo clic y sin perder el foco accesible,*
*para mover el trabajo fluidamente a lo largo del ciclo de vida.*

- **AC-02.1:** Cada tarjeta provee botones de flecha direccional contextuales:
  - En `TODO`: botón de avance hacia `IN_PROGRESS`.
  - En `IN_PROGRESS`: botón de retroceso a `TODO` y botón de avance a `DONE`.
  - En `DONE`: botón de retroceso hacia `IN_PROGRESS` (título tachado visualmente).
- **AC-02.2:** Al transicionar, la UI aplica la actualización de inmediato con los datos confirmados por la API (`setQueriesData`), actualizando la barra de avance del proyecto y los totales del dashboard sin parpadeo.
- **AC-02.3:** Al cambiar de columna, el foco del teclado se reubica automáticamente en la tarjeta en su nueva posición (`tabIndex={-1}` con `ref.focus()`), evitando que el foco caiga al `body` del documento.

### US-03: Filtrado Reactivo y Sincronización en URL (RF-13)
*Como usuario que comparte enlaces a vistas de trabajo específicas,*
*quiero que los filtros de búsqueda y prioridad se sincronicen en los parámetros de la URL,*
*para conservar la vista filtrada tras recargar la página o al compartir el enlace.*

- **AC-03.1:** El campo de búsqueda filtra por título en tiempo real con un debounce de 250 ms, actualizando el query param `?q=...` mediante `replaceState` sin inundar el historial de navegación.
- **AC-03.2:** La barra de filtros permite conmutar chips de prioridad (`LOW`, `MEDIUM`, `HIGH`). El filtro activo se refleja en `?priority=...`.
- **AC-03.3:** Al limpiar los filtros, los query params se eliminan limpiamente de la URL.
- **AC-03.4:** No se expone filtro de estado en la barra de filtros, ya que las 3 columnas representan inherentemente dicha dimensión y filtrarlas causaría confusión visual.

### US-04: Diálogo Modal de Creación y Edición de Tareas (RF-06, RF-10)
*Como usuario,*
*quiero un formulario modal accesible para crear nuevas tareas o editar existentes,*
*para capturar los metadatos requeridos con validación inmediata.*

- **AC-04.1:** El formulario valida que el título sea obligatorio (no vacío) y limita las longitudes máximas según el contrato de la API.
- **AC-04.2:** Permite seleccionar estado inicial y prioridad mediante controles estilizados.
- **AC-04.3:** Si se abre desde una columna específica, el selector de estado se inicializa con el estado de dicha columna.
- **AC-04.4:** Muestra errores de validación específicos por campo consumiendo el contrato RFC 7807 (`ProblemDetails.errors`).

---

## Technical Design & Architectural Invariants

### 1. Gestión de Caché y Mutaciones en TanStack Query
- Se implementa `useTasks` con `placeholderData: (previous) => previous` para garantizar que teclear en el campo de búsqueda no degrade la vista a esqueletos parpadeantes.
- Las mutaciones (`useCreateTask`, `useUpdateTask`, `useDeleteTask`) disparan la invalidación reactiva de la jerarquía de claves: `taskKeys.all`, `projectKeys.all` y `statsKey`, garantizando que el avance porcentual del proyecto refleje la realidad de forma síncrona.
- En `useUpdateTask`, se aplica la respuesta 200 de PostgreSQL directamente a la caché (`setQueriesData`) eliminando la latencia percibida del round-trip de refetch.

### 2. Sincronización URL y Resolución de Condiciones de Carrera
- En `TaskBoard.tsx`, la lectura de `URLSearchParams` para el temporizador de debounce de búsqueda se realiza dinámicamente desde `window.location.search` y no desde el snapshot del cierre léxico del render, previniendo que alternar un chip de prioridad mientras se escribe borre el filtro de prioridad recién seleccionado.

### 3. Accesibilidad y Navegación por Teclado (a11y)
- Las tarjetas desmontadas de una columna y montadas en otra preservan la cadena de foco mediante un `autoFocus` reactivo.
- Botones de acción contextual con etiquetas `aria-label` descriptivas ("Editar {título}", "Mover a En progreso", etc.).

---

## Non-Functional Requirements & Observability

- **Performance:** Cero re-renders superfluos durante el tecleo de filtros gracias al desacoplamiento entre el estado local del input y la sincronización con retardo en la URL.
- **Bundle Impact:** Reutilización estricta de componentes atómicos existentes (`Button`, `Modal`, `Badge`, `States`, `ProgressBar`), manteniendo el bundle de producción de `web` por debajo de 220 kB.
- **Contrato de Errores:** Renderizado amigable de excepciones mediante `messageFor()` y `fieldErrors()`.

---

## Work Breakdown Structure (WBS)

- **WP1 — Cliente HTTP y Hooks de Tareas (`web/src/features/tasks/api.ts`):**
  - Implementación de `useTasks`, `useCreateTask`, `useUpdateTask`, `useDeleteTask`.
  - Normalización de query strings con parámetros repetibles.
  - Invalidación coordinada de cachés de proyectos y estadísticas.
- **WP2 — Componente `TaskBoard.tsx`:**
  - Layout Kanban responsivo de tres columnas con contadores numéricos y botón de adición rápida.
  - Barra de herramientas con buscador debounced y chips de prioridad.
  - Sincronización bidireccional con `useSearchParams`.
- **WP3 — Componente `TaskCard.tsx`:**
  - Renderizado de tarjeta con badge de prioridad y título (tachado en `DONE`).
  - Botones de transición contextual (`ANTERIOR` / `SIGUIENTE`) con etiquetas ARIA.
  - Preservación de foco con `useRef` y `autoFocus`.
- **WP4 — Componente `TaskFormDialog.tsx`:**
  - Modal accesible para creación y actualización de tareas.
  - Enrutamiento de errores RFC 7807 a mensajes bajo cada campo.
  - Preselección automática del estado según la columna de origen.
- **WP5 — Integración en `ProjectDetailPage.tsx`:**
  - Montaje definitivo de `TaskBoard` en el detalle del proyecto.
  - Verificación de tipos con `npm run typecheck` y build Vite con `npm run build`.

---

## Verification Plan

| Escenario | Método de Verificación | Resultado Esperado |
|---|---|---|
| Carga del Tablero | Navegar a `/projects/:id` | Se renderizan 3 columnas con sus respectivas tareas |
| Creación de Tarea | Click en "+" de columna "En progreso" | Modal abre con estado preseleccionado; al guardar, aparece en la columna y sube el total de tareas |
| Transición de Estado | Click en flecha derecha en tarea de "Por hacer" | Salta a "En progreso", el foco permanece en la tarjeta y se actualiza el porcentaje de avance |
| Búsqueda con Debounce | Escribir término en buscador | La URL se actualiza a `?q=...` tras 250ms y filtra las columnas sin parpadeo |
| Filtro de Prioridad | Click en chip "Alta" | La URL se actualiza a `?priority=HIGH` y solo muestra tareas prioritarias |
| Eliminación de Tarea | Click en botón papelera y confirmar | La tarea se borra y se recalcula el avance del proyecto |
| Chequeo de Tipos | `npm run typecheck` | 0 errores en `api` y `web` |
| Compilación de Producción | `npm --prefix web run build` | Build exitoso sin advertencias de tipos |

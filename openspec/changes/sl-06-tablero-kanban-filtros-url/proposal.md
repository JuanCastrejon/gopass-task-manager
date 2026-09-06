# Proposal: SL-06 — Tablero Kanban de Tareas, Transiciones de Estado y Sincronización con URL

## Why

Para que los usuarios puedan interactuar visual y eficientemente con las tareas de cada proyecto, el sistema requiere un tablero Kanban interactivo con 3 columnas por estado (`TODO`, `IN_PROGRESS`, `DONE`), transiciones rápidas de estado con preservación de foco accesible y filtros de búsqueda y prioridad sincronizados bidireccionalmente en la URL.

## What Changes

- **WP1 - Cliente y Hooks React Query (`web/src/features/tasks/api.ts`):**
  - Hooks `useTasks`, `useCreateTask`, `useUpdateTask`, `useDeleteTask`.
  - Aplicación inmediata de datos confirmados de PostgreSQL (`setQueriesData`) sin round-trip superfluo.
  - Invalidación reactiva coordinada hacia `taskKeys`, `projectKeys` y `statsKey`.
- **WP2 - Tablero Kanban (`web/src/features/tasks/TaskBoard.tsx`):**
  - Grilla de 3 columnas con contadores numéricos y botones de adición directa por estado.
  - Barra de herramientas con buscador con debounce (250 ms) y chips de filtro de prioridad.
  - Lectura segura de `URLSearchParams` desde `window.location.search` para evitar condiciones de carrera.
- **WP3 - Tarjeta de Tarea (`web/src/features/tasks/TaskCard.tsx`):**
  - Controles direccionales contextuales para transicionar entre estados en 1 clic.
  - Preservación de foco accesible mediante `useRef` y `autoFocus` al remontar tarjetas.
- **WP4 - Diálogo Modal (`web/src/features/tasks/TaskFormDialog.tsx`):**
  - Formulario modal accesible para creación y actualización con validaciones y feedback RFC 7807.
- **WP5 - Integración (`web/src/features/projects/ProjectDetailPage.tsx`):**
  - Montaje del tablero en el detalle del proyecto, conectando edición de proyecto y gestión de tareas.

## Business Fit y KPIs

| Criterio | Objetivo | Verificación |
|---|---|---|
| Latencia percibida de transición | < 50 ms en pantalla | `setQueriesData` en `onSuccess` |
| Accesibilidad de foco | 0 caídas al `body` al mover tarjeta | `autoFocus` reactivo |
| Sincronización URL | 100% persistencia de filtros al recargar | `useSearchParams` + `replaceState` |
| Calidad de código | 0 errores de tipado y build exitoso | `npm run typecheck` + `vite build` |

## Perfil de Readiness

`L2 - Operational UI & Reactive Filtering`. Tablero Kanban completo integrado con la API de tareas y la barra de avance.

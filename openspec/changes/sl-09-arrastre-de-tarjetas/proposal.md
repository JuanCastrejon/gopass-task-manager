# Proposal: SL-09 — Arrastre de tarjetas entre columnas

## Why

Los controles explícitos funcionan y son accesibles, pero mover una tarjeta es una manipulación
directa: el gesto natural es cogerla y soltarla donde va. Tras medir que el conflicto con el
carrusel se resuelve con un retardo de activación, la razón que sostenía el descarte deja de
aplicarse.

## What Changes

- **WP1 — Sensores y contexto (`TaskBoard.tsx`):** `DndContext` de `@dnd-kit/core` con
  `MouseSensor` por distancia (6 px) y `TouchSensor` por tiempo (250 ms, tolerancia 8 px).
  Sin `KeyboardSensor`: interceptaría las teclas de los botones que viven dentro de la tarjeta.
- **WP2 — Zonas de destino:** cada columna es un `useDroppable` cuyo `id` es el estado, con
  realimentación visual al sobrevolar.
- **WP3 — Superficie arrastrable (`TaskCard.tsx`):** la tarjeta entera, con editar, borrar y las dos
  flechas deteniendo el gesto en fase de captura para no perder sus clics.
- **WP4 — Anclaje y overlay:** `scroll-snap-type` se apaga durante el arrastre y se restaura al
  soltar; el clon se pinta en un portal (`DragOverlay`) para que el `overflow-x` del carrusel no lo
  recorte.
- **WP5 — Proyección de presentación:** al soltar, la tarjeta se queda en destino mediante estado
  local, no escribiendo una predicción en la caché.
- **WP6 — Dos escenarios E2E:** mover entre columnas con persistencia, y soltar fuera para
  comprobar el retorno sin petición.

## Capabilities

### New Capabilities
- `tasks-drag-and-drop` — mover una tarea entre estados arrastrándola.

### Modified Capabilities
- `tasks-board-web` — la columna pasa a ser zona de destino; las flechas no cambian.

## Exclusiones de alcance

- **Reordenar dentro de una columna.** El orden lo fija PostgreSQL (`priority DESC, created_at DESC`),
  no el usuario. Por eso no entra `@dnd-kit/sortable`.
- **Arrastre por teclado.** Las flechas ya cubren esa vía, y con mejor semántica.
- **Zonas de destino fijas flotando sobre el tablero.** Restan altura en 375 px y duplican la
  representación del flujo que las columnas ya comunican.

## Impact

Las flechas se conservan íntegras, incluida su gestión de foco. El arrastre permite cualquier
columna; las flechas siguen ofreciendo solo la contigua, porque en una tarjeta estrecha caben dos
botones y no tres.

## Perfil de Readiness

`L2` (Operational). Interfaz sobre un endpoint que ya existe y ya está probado. Sin cambios de
esquema, de contrato ni de superficie de ataque.

## Viabilidad y esfuerzo

- **Esfuerzo:** M
- **Riesgo técnico:** medio — el conflicto de gestos está medido y resuelto, pero el hardware táctil
  real no se ha probado.
- **Riesgo funcional:** bajo — la vía anterior sigue intacta, así que el peor caso es que el
  arrastre no active y el usuario use las flechas.

# Proposal: SL-15 — Orden manual de tareas dentro de una columna

## Why

El orden dentro de una columna era exclusivamente automático (`created_asc`, `created_desc`,
`priority_asc`, `priority_desc`). Aunque resolver el orden por columna (SL-14) mejoró la visualización
del flujo, persistía una brecha fundamental de usabilidad en un tablero kanban: **los usuarios no
podían ordenar manualmente sus tareas por arrastre dentro de una columna**.

El arrastre implementado en SL-09 cubría el movimiento *entre* columnas, pero no el reordenado vertical
*dentro* de una columna. SL-15 completa esta capacidad permitiendo reordenar tareas en O(1) mediante
posiciones fraccionarias persistidas en PostgreSQL y blindadas contra colisiones de precisión y
condiciones de carrera.

## What Changes

- **WP1 — Esquema de posición fraccionaria y unicidad (`0006_tasks_position.sql`):**
  - Columna `tasks.position` de tipo `double precision NOT NULL`.
  - Valor `'manual'` añadido a `ENUM column_sort`.
  - Backfill ordenado por `(created_at DESC, id) * 1024.0` para preservar el orden preexistente.
  - Restricción única `CONSTRAINT tasks_position_unica UNIQUE (column_id, position)`.
  - Trigger `tasks_set_position` para asignar `COALESCE(MAX(position), 0) + 1024.0` en inserciones
    sin posición explícita (soporte para seed y `psql`).
- **WP2 — Orden manual por defecto en columnas (`0007_columnas_orden_manual_por_defecto.sql`):**
  - `ALTER TABLE project_columns ALTER COLUMN sort SET DEFAULT 'manual';`.
  - Ejecución con `--no-single-transaction` en `node-pg-migrate` para evitar `SQLSTATE 55P04`.
- **WP3 — Endpoint de reordenación y rebalanceo en API:**
  - `PATCH /api/tasks/:id/reorder` con `{ columnId, previousTaskId, nextTaskId }`.
  - Asignación de punto medio `(a + b) / 2.0` en O(1).
  - Captura de colisión `SQLSTATE 23505` (límite de mantisa a 52 inserciones) y desbordamiento
    `SQLSTATE 22003` (1 084 divisiones al principio) con rebalanceo automático en dos pasos mediante
    `ROW_NUMBER() OVER (...) * 1024.0`.
  - Convivencia con ADR-024: `manual` integrado como rama de la escalera de `CASE` en `LIST_QUERY`.
- **WP4 — Interfaz de usuario con `@dnd-kit/sortable`:**
  - Adopción de `@dnd-kit/sortable` con estrategia vertical sobre tarjetas en columnas manuales.
  - Bloqueo de arrastre vertical y aviso explicativo visible en columnas con orden automático.
  - Proyección optimista inmediata y sincronización de caché con TanStack Query.
- **WP5 — Verificación exhaustiva:**
  - 117 pruebas en API (integración de orden manual, límites de precisión y convivencia con ADR-024).
  - 23 pruebas en Web.
  - 11 pruebas E2E en Playwright (persistencia tras recarga y bloqueo explicativo en orden automático).
  - ADR-025 y ADR-026 en `docs/spec/04-arquitectura.md`.

## Capabilities

### Modified Capabilities
- `board-columns` — nuevo valor `manual` en el enum `column_sort` y valor por defecto para nuevas columnas.
- `tasks-drag-and-drop` — reordenación vertical dentro de columnas y bloqueo en columnas automáticas.
- `tasks-api` — nuevo endpoint `PATCH /tasks/:id/reorder` con posición fraccionaria y rebalanceo.

## Decisiones con su porqué

**Posición fraccionaria con restricción única en lugar de enteros.** Renumerar enteros exige N operaciones
`UPDATE` por movimiento (como hace `sanidhyy/trello-clone`). La posición fraccionaria calcula el punto
medio en $O(1)$. El fallo silencioso de agotamiento de mantisa a las 52 inserciones se convierte en
`SQLSTATE 23505` gracias a `tasks_position_unica`, rebalanceando solo cuando es necesario.

**`numeric` no es la solución al colapso.** Medido en PostgreSQL 16: la división en `numeric` trunca a
escala fija y solo amplía el agotamiento a 67 huecos frente a 52, colapsando de forma igualmente silenciosa.

**Transacción independiente por migración con `--no-single-transaction`.** `node-pg-migrate` por defecto
agrupa todo en una sola transacción. Separar en dos archivos `0006` y `0007` exigía este flag para evitar
el `55P04` al usar el nuevo valor del enum en un `SET DEFAULT`.

**Bloqueo y aviso visible en columnas automáticas.** El arrastre no altera la configuración de la columna
a escondidas; reordenar manualmente exige pasar la columna a `manual` de forma deliberada.

## Exclusiones de alcance

- **Edición manual numérica de posiciones en la UI.** El cálculo es puramente interno.
- **Transición de orden manual a automático sin confirmación.** Cambiar el selector de columna reordena en consulta sin alterar las posiciones almacenadas.

## Impact

Totalmente compatible: columnas existentes conservan su criterio y tareas preexistentes recibieron su posición inicial espaciada a 1024.0 mediante backfill.

## Perfil de Readiness

`L1` en interfaz y `L2` en datos (cambio aditivo y atómico de esquema con restricción única y trigger).

## Viabilidad y esfuerzo

- **Esfuerzo:** M
- **Riesgo técnico:** bajo — rebalanceo bajo colisión verificado empíricamente contra PostgreSQL 16.
- **Riesgo funcional:** bajo — convivencia estricta con ADR-024 mediante escalera de `CASE`.

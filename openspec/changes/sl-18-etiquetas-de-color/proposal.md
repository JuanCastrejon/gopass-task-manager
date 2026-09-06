# Proposal: SL-18 — Etiquetas de color por proyecto con modelo relacional y clave foránea compuesta

## Why

La categorización visual en proyectos con múltiples frentes de trabajo exige una dimensión ortogonal al estado (columna) y a la prioridad (urgencia). Sin etiquetas, los usuarios recurren a prefijar títulos (`[Backend]`, `[Infra]`), lo que ensucia la lectura, impide el filtrado atómico y fragmenta la búsqueda.

SL-18 incorpora etiquetas de color por proyecto con modelo relacional normalizado (`labels` y tabla puente `task_labels`), asignación atómica desde el diálogo de tarea, filtrado reactivo persistente en la URL y paleta semántica de 12 colores con contraste verificado. La decisión central de diseño prioriza la integridad referencial y el coste de renombrado frente a un array `text[]` con GIN, y blinda mediante claves foráneas compuestas que una tarea jamás acepte etiquetas de otro proyecto.

## What Changes

- **WP1 — Esquema relacional e integridad (`0009_etiquetas.sql` y `0010_etiquetas_cascada_al_borrar_proyecto.sql`):**
  - Tabla `labels` con `project_id`, `name`, `color` y restricciones:
    - `labels_name_not_blank` y longitud máxima 50.
    - `labels_color_check` cerrando la paleta a 12 tokens semánticos en el propio motor.
    - `labels_id_project_id_key UNIQUE (id, project_id)` para habilitar foráneas compuestas.
    - `labels_project_name_unique_ci` sobre `(project_id, lower(btrim(name)))` para unicidad insensible a mayúsculas.
    - `ON DELETE CASCADE` hacia `projects` (ADR-030: una etiqueta es configuración del proyecto, no contenido a proteger).
  - Restricción única en `tasks`: `tasks_id_project_id_key UNIQUE (id, project_id)`.
  - Tabla puente `task_labels` con clave primaria compuesta `(task_id, label_id)` y dos claves foráneas compuestas con `ON DELETE CASCADE`:
    - `(task_id, project_id) REFERENCES tasks (id, project_id)`
    - `(label_id, project_id) REFERENCES labels (id, project_id)`
- **WP2 — Contrato de API y persistencia:**
  - Endpoints CRUD de etiquetas: `GET /api/projects/:id/labels`, `POST /api/projects/:id/labels`, `PATCH /api/labels/:id`, `DELETE /api/labels/:id` (con `?confirm=true` si tiene tareas asociadas).
  - Reemplazo atómico de etiquetas de tarea: `PUT /api/tasks/:id/labels` enviando `{ labelIds: string[] }`.
  - Lectura de etiquetas en segunda consulta (`WHERE task_id = ANY(...)`), manteniendo `LIST_QUERY` y la escalera de `CASE` de ADR-024 intactas.
  - Filtro repetible `?labels=<uuid>` en `GET /api/projects/:id/tasks` mediante `EXISTS` en la cláusula `ON` del `LEFT JOIN` para preservar la fila fantasma y evitar 404 falsos en proyectos vacíos.
  - Documentación Swagger / OpenAPI completa en `api/src/docs/swagger.ts`.
- **WP3 — Interfaz de usuario y accesibilidad:**
  - Diálogo de gestión de etiquetas `LabelManagerDialog.tsx` con listado, edición, creación y borrado con confirmación si está en uso.
  - Asignación mediante chips seleccionables en `TaskFormDialog.tsx`.
  - Insignia `Badge.tsx` variante etiqueta con tokens semánticos (texto oscuro sobre fondo pastel) y texto visible para no comunicar exclusivamente por color.
  - Filtro interactivo en cabecera del tablero con persistencia en URL (`use-filtros-de-url.ts`).
- **WP4 — Pruebas y suites de calidad:**
  - 12 pruebas de integración en `api/tests/integration/labels.test.ts` (CRUD, validaciones, 409 por nombre repetido, 409 por borrado sin confirmación, foránea compuesta multidominio y reemplazo PUT).
  - 1 prueba de regresión en `api/tests/integration/projects.test.ts` asegurando borrado de proyecto con etiquetas y 0 tareas.
  - 8 pruebas de componentes de etiquetas en `web/src/features/labels/__tests__/`.
  - 2 pruebas de asignación en `web/src/features/tasks/__tests__/TaskFormDialogLabels.test.tsx`.
  - 1 prueba E2E completa en `e2e/etiquetas.spec.ts` (creación, asignación, visualización en tarjeta, filtrado en URL y persistencia tras recarga).
- **WP5 — Documentación técnica y mediciones:**
  - ADR-029 (etiquetas normalizadas con clave foránea compuesta) y ADR-030 (etiquetas como configuración con borrado en cascada) en `docs/spec/04-arquitectura.md`.
  - Banco de pruebas empírico con 200 proyectos, 20 000 tareas y 40 000 asignaciones en `docs/spec/08-verificacion-postgres.md`.
  - Contrato de API actualizado en `docs/spec/03-contrato-api.md` y colección `docs/api.http`.

## Capabilities

### Modified Capabilities
- `tasks-api` — endpoints de tareas devuelven `labels: Label[]`, filtrado por `labels`, y endpoint `PUT /tasks/:id/labels`.
- `tasks-board-web` — renderizado de etiquetas en `TaskCard`, selector de etiquetas en `TaskFormDialog`, y filtro por etiquetas en barra de herramientas del tablero.

### Added Capabilities
- `labels-management` — ciclo de vida completo de etiquetas de proyecto (creación, edición, borrado protegido y asignación multidominio).

## Decisiones con su porqué

**Modelo relacional normalizado frente a array `text[]` con GIN.**
Medido en un banco de 200 proyectos, 20 000 tareas y 40 000 asignaciones: la diferencia en tiempo de consulta es insignificante (fracciones de milisegundo) porque el índice por proyecto reduce a ~100 filas antes de evaluar las etiquetas. La decisión la imponen:
1. **La integridad:** un array acepta etiquetas huérfanas o inexistentes en silencio; la tabla puente genera `ERROR 23503` en el motor.
2. **El renombrado:** renombrar una etiqueta en uso cuesta 0,346 ms en el modelo normalizado frente a 1,540 ms con array (4,5 veces más lento, y su coste escala con el número de tareas asociadas).

**Claves foráneas compuestas para integridad multidominio.**
Sin `(task_id, project_id)` y `(label_id, project_id)` en `task_labels`, una tarea del proyecto A podría recibir etiquetas del proyecto B sin que el motor lo impida. La clave foránea compuesta garantiza en el motor que una asignación cruzada devuelva inmediatamente `ERROR 23503`.

**Lectura de etiquetas en segunda consulta.**
Medido: 0,867 ms con dos consultas (`LIST_QUERY` + `WHERE task_id = ANY(...)`) frente a 1,429 ms con una única consulta agregando mediante `LEFT JOIN` + `jsonb_agg` + `GROUP BY`. Mantener `LIST_QUERY` intacta preserva la escalera de `CASE` de ADR-024 y elimina por construcción el riesgo de multiplicar filas en el join.

**Filtro en la cláusula `ON` del `LEFT JOIN`.**
El filtro `AND ($5::uuid[] IS NULL OR EXISTS (...))` se ubica dentro de la cláusula `ON` y nunca en el `WHERE`. Colocarlo en el `WHERE` descartaría la fila del proyecto cuando no hay tareas coincidentes, transformando un proyecto válido sin tareas en un `404 Not Found` falso.

**Una etiqueta es configuración del proyecto, no contenido (`CASCADE`).**
La migración `0009` utilizó erróneamente `ON DELETE RESTRICT` copiando a `tasks`. Esto provocó un `HTTP 500` en la prueba E2E al borrar un proyecto con etiquetas y sin tareas. Las etiquetas pertenecen a la configuración del tablero (como `project_columns`), por lo que su borrado debe ser `CASCADE`. El contenido a proteger siguen siendo las tareas (`tasks` con `RESTRICT` y 409).

**Paleta cerrada de 12 colores semánticos impuesta por el motor.**
La restricción `CHECK (color IN (...))` en PostgreSQL asegura que ni la API, ni el seed ni scripts manuales en `psql` inserten valores arbitrarios o colores hexadecimales sin contraste garantizado.

## Exclusiones de alcance

- Colores hexadecimales libres definidos por el usuario (romperían el contraste WCAG 2.1 AA).
- Reasignación masiva de etiquetas entre proyectos.
- Límite artificial de cantidad de etiquetas por tarea.

## Impact

Retrocompatible: las tareas existentes devuelven `labels: []`. Las consultas de listado mantienen su tiempo de ejecución sub-milisegundo.

## Perfil de Readiness

`L1` en interfaz y `L2` en datos.

## Viabilidad y esfuerzo

- **Esfuerzo:** M
- **Riesgo técnico:** bajo — blindado por claves foráneas compuestas y verificaciones empíricas en PostgreSQL.
- **Riesgo funcional:** bajo — no modifica la escalera de ordenación de ADR-024 ni las invariantes de columnas.

# Proposal: SL-05 — Endpoints de Tareas, Máquina de Estados, Prioridad y Filtros SQL

## Why

Para gobernar el flujo de trabajo operativo de los proyectos en GoPass Task Manager, el sistema requiere una API de tareas exhaustiva que garantice la integridad de la máquina de estados (`TODO`, `IN_PROGRESS`, `DONE`), la ordenación por prioridades (`LOW`, `MEDIUM`, `HIGH`), el sellado inalterable de `completed_at` mediante triggers en PostgreSQL y el filtrado multifactorial en una sola consulta SQL sin falsos 404.

## What Changes

- **WP1 - Schemas Zod con Validación Estricta (`api/src/modules/tasks/tasks.schema.ts`):**
  - Schemas `.strict()` que rechazan `completedAt` en el payload para blindar el trigger de la base.
  - Normalizador de query params repetibles (`repeatable()`) para soportar arrays y escalares transparentemente.
- **WP2 - Repositorio SQL con Filtros en `LEFT JOIN` (`api/src/modules/tasks/tasks.repository.ts`):**
  - `LIST_QUERY` con filtros en la condición `ON` para distinguir proyectos sin tareas (200 `[]`) de proyectos inexistentes (404).
  - Mutaciones dinámicas con lista blanca `WRITABLE` y ordenamiento nativo `ORDER BY t.priority DESC`.
  - Desambiguación de clave foránea `23503` en reasignación de proyecto destino.
- **WP3 - Enrutadores REST Anidados y Planos (`api/src/modules/tasks/tasks.routes.ts`):**
  - `projectTasksRouter` en `/api/projects/:projectId/tasks` (creación y listado por composición).
  - `tasksRouter` en `/api/tasks/:id` (detalle, actualización parcial y borrado plano).
- **WP4 - Swagger UI Completo (`api/src/docs/swagger.ts`):**
  - Rutas y esquemas de tareas integrados en OpenAPI 3.0.3 en `/api/docs`.
- **WP5 - Suite de Pruebas de Integración (`api/tests/integration/tasks.test.ts`):**
  - 40 pruebas en PostgreSQL real validando invariantes, filtros y transiciones.

## Business Fit y KPIs

| Criterio | Objetivo | Verificación |
|---|---|---|
| Incoercibilidad de `completed_at` | 0 escrituras por cliente | Zod `.strict()` + trigger |
| Precisión en filtros vacíos | 0 falsos 404 | Filtros en `LEFT JOIN` |
| Ordenamiento de prioridades | HIGH de primero sin CASE | Enum nativo PostgreSQL |
| Cobertura de pruebas | 40 pruebas en verde | Vitest en PostgreSQL 16 |

## Perfil de Readiness

`L2 - Operational API & State Machine`. Implementa endpoints de tareas, lógica de estados e integración con OpenAPI.

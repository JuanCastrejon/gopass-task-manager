# Proposal: SL-03 — Endpoints de Proyectos, Métricas de Avance y Swagger UI

## Why

Para gobernar proyectos de desarrollo de forma desacoplada y eficiente, el sistema GoPass Task Manager requiere una API REST robusta que evite el problema N+1 en el cálculo de avance, soporte mutaciones seguras en PATCH, evite carreras de concurrencia en la eliminación de proyectos con tareas asociadas y proporcione una interfaz viva de OpenAPI 3.0 / Swagger UI para exploración inmediata.

## What Changes

- **WP1 - Módulo de Proyectos (`api/src/modules/projects/`):**
  - Schemas Zod con normalización `.trim()` y soporte de `null` para borrado de descripción.
  - Repositorio SQL con `SUMMARY_QUERY` (cálculo de avance en un solo viaje vía subconsulta agrupada).
  - Eliminación atómica con captura de `tasks_project_id_fkey` para emitir 409 `PROJECT_HAS_TASKS`.
  - Mapeador de DTOs a `camelCase` y enrutador REST en `projects.routes.ts`.
- **WP2 - Módulo de Métricas y Analítica (`api/src/modules/stats/stats.routes.ts`):**
  - Consulta analítica `STATS_QUERY` con CTEs y `unnest(enum_range(NULL::task_status))` para garantizar presencia de claves con valor 0.
- **WP3 - Swagger UI Interactivo (`api/src/docs/swagger.ts`):**
  - Montaje de `swagger-ui-express` en `/api/docs` y JSON en `/api/docs.json`.
  - Documentación de esquemas exitosos y errores normativos RFC 7807 (`application/problem+json`).
- **WP4 - Suite de Pruebas de Integración:**
  - 24 pruebas de integración en `projects.test.ts` y 4 pruebas en `stats.test.ts` sobre PostgreSQL 16.

## Business Fit y KPIs

| Criterio | Objetivo | Verificación |
|---|---|---|
| Consultas SQL al listar proyectos | 1 sola consulta (sin N+1) | `SUMMARY_QUERY` |
| Protección en eliminación con tareas | 0 carreras TOCTOU | Captura atómica de FK -> 409 `PROJECT_HAS_TASKS` |
| Limpieza de campos en PATCH | Soportar `description: null` | Validación Zod y SQL dinámico parametrizado |
| Accesibilidad de documentación | Exploración inmediata en navegador | `GET /api/docs` con Swagger UI |
| Cobertura de integración | 28 pruebas en verde | Vitest contra PostgreSQL real |

## Perfil de Readiness

`L2 - Operational API`. Expone endpoints funcionales para la gestión de proyectos, métricas y contratos de integración.

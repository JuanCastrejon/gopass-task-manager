# Proposal: SL-02 — Esquema Relacional, Triggers de Auditoría, Contrato RFC 7807 y Seed

## Why

Para gobernar el ciclo de vida de proyectos y tareas operativas en GoPass Task Manager, delegar la consistencia exclusivamente a la capa de aplicación introduce riesgos de estados corruptos, orfandad de tareas y dispersión de contratos de error.

Este slice establece la arquitectura relacional inicial en PostgreSQL 16 (`projects`, `tasks`), tipos enumerados nativos (`task_status`, `task_priority`), restricciones declarativas de integridad (`CHECK`, índice funcional `UNIQUE` insensible a mayúsculas), triggers automáticos en PL/pgSQL para sellado de tiempo e invariantes de estado, un adaptador desacoplado del driver de persistencia (`pg-error.ts`) que mapea excepciones SQL al estándar normativo RFC 7807 (`application/problem+json`), y una rutina de sembrado de datos (*seed*) totalmente idempotente.

## What Changes

- **WP1 - Esquema DDL en PostgreSQL 16 (`0001_initial_schema.sql`):**
  - Tipos ENUM nativos `task_status` ('TODO', 'IN_PROGRESS', 'DONE') y `task_priority` ('LOW', 'MEDIUM', 'HIGH').
  - Tablas `projects` y `tasks` con claves primarias UUID nativas (`gen_random_uuid()`).
  - Restricción foránea `tasks_project_id_fkey` con `ON DELETE RESTRICT`.
  - Índice funcional único `projects_name_unique_ci` sobre `lower(btrim(name))`.
  - Invariante `tasks_done_completed_at` (CHECK) y trigger `set_task_completed_at()` (PL/pgSQL).
  - Triggers `set_updated_at()` para auditoría automática.
- **WP2 - Adaptador y Desambiguación de Errores (`pg-error.ts`):**
  - Mapeo de errores 23505 a `PROJECT_NAME_TAKEN` (409) y 23514/23502/22P02 a `ValidationError` (400).
  - Desambiguación arquitectónica de 23503 delegada al repositorio mediante helper `isTaskProjectFkViolation`.
- **WP3 - Catálogo y Serialización RFC 7807 (`errors.ts`, `error-handler.ts`):**
  - Catálogo formal `ERROR_CODES` y clases derivadas de `AppError`.
  - Middleware global Express con formato `application/problem+json`, `requestId` y supresión de trazas técnicas en producción.
- **WP4 - Sembrado Idempotente (`seed.ts`):**
  - Carga determinista de 4 proyectos y 11 tareas representativas del dominio GoPass mediante `ON CONFLICT (id) DO NOTHING`.

## Business Fit y KPIs

| Criterio | Objetivo | Verificación |
|---|---|---|
| Incoherencia de estado de completado | 0% inconsistencias | CHECK `tasks_done_completed_at` + trigger `set_task_completed_at` |
| Orfandad referencial en proyectos | 0 tareas huérfanas | FK `ON DELETE RESTRICT` |
| Duplicidad de proyectos insensible a mayúsculas | 0 duplicados | Índice único `projects_name_unique_ci` |
| Formato uniforme de error HTTP | 100% RFC 7807 | Payload `application/problem+json` con `code` y `requestId` |
| Idempotencia del seed | 100% ejecuciones exitosas | `ON CONFLICT (id) DO NOTHING` |

## Perfil de Readiness

`L2 - Operational / Data & Contracts`. Establece el modelo relacional, las invariantes de datos y el estándar de comunicación de errores hacia las capas superiores.

# Tasks: SL-02 — Esquema Relacional, Triggers de Auditoría, Contrato RFC 7807 y Seed

- [x] Crear migración `api/migrations/0001_initial_schema.sql` con tipos ENUM, tablas, índices y triggers.
- [x] Implementar módulo desacoplado `api/src/db/pg-error.ts`.
- [x] Definir catálogo `ERROR_CODES` y clases de error en `api/src/http/errors.ts`.
- [x] Configurar middleware `errorHandler` y `notFoundHandler` en `api/src/http/error-handler.ts`.
- [x] Configurar middleware de correlación `requestId` en `api/src/http/request-id.ts`.
- [x] Implementar utilidades de validación de schemas en `api/src/http/validate.ts`.
- [x] Montar handlers en `api/src/app.ts`.
- [x] Crear script de sembrado idempotente `api/src/db/seed.ts` (4 proyectos y 11 tareas).
- [x] Escribir y ejecutar suite de pruebas unitarias `api/tests/unit/pg-error.test.ts`.
- [x] Verificar compilación estricta de TypeScript (`npm run typecheck`).

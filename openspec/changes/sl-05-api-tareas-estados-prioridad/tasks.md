# Tasks: SL-05 — Endpoints de Tareas, Máquina de Estados, Prioridad y Filtros SQL

- [x] Portar esquemas Zod en `api/src/modules/tasks/tasks.schema.ts` con `.strict()` y normalizador de query.
- [x] Portar repositorio en `api/src/modules/tasks/tasks.repository.ts` con `LIST_QUERY` en `LEFT JOIN`.
- [x] Portar mapeador DTO en `api/src/modules/tasks/tasks.mapper.ts`.
- [x] Portar enrutadores en `api/src/modules/tasks/tasks.routes.ts`.
- [x] Actualizar `api/src/docs/swagger.ts` con rutas y schemas de tareas en OpenAPI 3.0.
- [x] Conectar enrutadores en `api/src/app.ts` con precedencia de rutas anidadas.
- [x] Portar y ejecutar suite de 40 pruebas de integración en `api/tests/integration/tasks.test.ts`.
- [x] Validar tipado estricto `npm run typecheck`.

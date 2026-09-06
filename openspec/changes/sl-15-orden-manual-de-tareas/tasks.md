# Tasks: SL-15 — Orden manual de tareas dentro de una columna

## 1. Esquema y base de datos

- [x] 1.1 Medir contra PostgreSQL 16 los límites de precisión de `double precision` y `numeric`
- [x] 1.2 `0006_tasks_position.sql` con `position double precision`, restricción `tasks_position_unica`, trigger `tasks_set_position` y valor `'manual'` en enum `column_sort`
- [x] 1.3 `0007_columnas_orden_manual_por_defecto.sql` con `ALTER COLUMN sort SET DEFAULT 'manual'`
- [x] 1.4 Configurar `--no-single-transaction` en `docker-entrypoint.sh` y `package.json` para evitar `SQLSTATE 55P04`

## 2. API

- [x] 2.1 Escalera de `CASE` en `LIST_QUERY` integrando `manual` respetando la precedencia de ADR-024
- [x] 2.2 Endpoint `PATCH /api/tasks/:id/reorder` con cálculo de punto medio $O(1)$
- [x] 2.3 Manejo de colisión `SQLSTATE 23505` y desbordamiento `SQLSTATE 22003` con rebalanceo automático en dos pasos mediante `SAVEPOINT`

## 3. Interfaz

- [x] 3.1 Integración de `@dnd-kit/sortable` con estrategia vertical sobre tarjetas en columnas manuales
- [x] 3.2 Bloqueo estricto del arrastre vertical y aviso explicativo visible en columnas con orden automático
- [x] 3.3 Mutación optimista en `useReorderTask` con rollback ante error y refetch en `onSettled`

## 4. Validación y documentación

- [x] 4.1 Pruebas de integración de API (117 pruebas totales, incluyendo límites de hueco y convivencia con ADR-024)
- [x] 4.2 Pruebas unitarias y de componentes en frontend (23 pruebas totales)
- [x] 4.3 Pruebas E2E en Playwright (`e2e/orden-manual-de-tareas.spec.ts`, 11 pruebas totales en la suite)
- [x] 4.4 ADR-025 y ADR-026 en `docs/spec/04-arquitectura.md` con mediciones empíricas y alternativas descartadas
- [x] 4.5 Actualización de especificación de dominio (`02-modelo-dominio.md`), estrategia de calidad (`05-estrategia-calidad.md`), mediciones de PostgreSQL (`08-verificacion-postgres.md`) y `README.md`

## 5. Pendiente

- [ ] 5.1 Issue enriquecido con las 19 secciones del estándar
- [ ] 5.2 PR contra `develop` y trazabilidad de cierre

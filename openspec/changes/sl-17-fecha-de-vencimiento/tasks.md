# Tasks: SL-17 — Fecha de vencimiento con semáforo calculado en el cliente

## 1. Esquema y base de datos

- [x] 1.1 Medir el desfase de 5 horas entre contenedor UTC y Bogotá (GMT-05:00) para sustentar la elección de `date` frente a `timestamptz`
- [x] 1.2 Migración `0008_tasks_due_date.sql` con columna `tasks.due_date date` y valor `'due_asc'` en el enum `column_sort`
- [x] 1.3 Configurar parser de identidad para OID 1082 en `api/src/db/pool.ts` y documentar su alcance global al proceso Node.js

## 2. API y persistencia

- [x] 2.1 Esquemas Zod en `api/src/modules/tasks/tasks.schema.ts` con validación de regex `YYYY-MM-DD`, validez de calendario y nullabilidad
- [x] 2.2 Mapeo en `tasks.mapper.ts` y persistencia en `tasks.repository.ts`
- [x] 2.3 Escalera de `CASE` en `LIST_QUERY` integrando `due_asc` con `NULLS LAST` preservando la precedencia de ADR-024
- [x] 2.4 Documentación OpenAPI/Swagger en `api/src/docs/swagger.ts`

## 3. Interfaz y componentes

- [x] 3.1 Función pura de cálculo de semáforo `calcularEstadoVencimiento` y diagnóstico de completado en `web/src/features/tasks/due-date.ts`
- [x] 3.2 Insignia `DueDateBadge` en `web/src/components/ui/Badge.tsx` con texto explícito y `aria-label` descriptivo
- [x] 3.3 Integración de `<input type="date">` nativo en `TaskFormDialog.tsx` para crear y editar tareas
- [x] 3.4 Actualización de tipos en `web/src/types/api.ts` y servicio de red en `web/src/features/tasks/api.ts`

## 4. Validación y documentación

- [x] 4.1 48 pruebas en `tasks.test.ts` (incluyendo 5 pruebas dedicadas a SL-17: CRUD, validación en español, orden `due_asc`, convivencia con ADR-024 e ida y vuelta sin desfase)
- [x] 4.2 14 pruebas unitarias de semáforo en `due-date.test.ts` con fecha inyectada
- [x] 4.3 1 prueba E2E en Playwright (`e2e/fecha-de-vencimiento.spec.ts`) con persistencia tras recarga
- [x] 4.4 Seed con tareas en los tres estados de vencimiento y tareas sin fecha (`api/src/db/seed.ts`)
- [x] 4.5 ADR-028 en `docs/spec/04-arquitectura.md` y mediciones en `docs/spec/08-verificacion-postgres.md`

## 5. Pendiente

- [ ] 5.1 Issue enriquecido con las 19 secciones del estándar
- [ ] 5.2 PR contra `develop` y trazabilidad de cierre

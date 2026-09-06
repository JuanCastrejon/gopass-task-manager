# Tasks: SL-18 — Etiquetas de color por proyecto

## 1. Esquema y base de datos

- [x] 1.1 Medir el banco de 200 proyectos, 20 000 tareas y 40 000 asignaciones comparando el modelo normalizado frente a `text[]` + GIN
- [x] 1.2 Migración `0009_etiquetas.sql` con tabla `labels`, restricción `CHECK` de paleta de 12 colores, unicidad insensible a mayúsculas y tabla puente `task_labels` con claves foráneas compuestas
- [x] 1.3 Migración `0010_etiquetas_cascada_al_borrar_proyecto.sql` corrigiendo la foránea de `labels` a `ON DELETE CASCADE` tras descubrir el defecto de 500 en E2E

## 2. API y persistencia

- [x] 2.1 Esquemas Zod en `api/src/modules/labels/labels.schema.ts` y ampliación de `tasks.schema.ts` con filtros y payload de etiquetas
- [x] 2.2 Rutas y controladores de etiquetas en `api/src/modules/labels/` (endpoints CRUD y `PUT /tasks/:id/labels`)
- [x] 2.3 Repositorio `labels.repository.ts` con soporte transaccional y protección ante duplicados y asignaciones cruzadas
- [x] 2.4 Repositorio `tasks.repository.ts`: lectura en segunda consulta (`getLabelsForTasks`) y filtro `EXISTS` en cláusula `ON` del `LEFT JOIN`
- [x] 2.5 Documentación OpenAPI / Swagger en `api/src/docs/swagger.ts`

## 3. Interfaz y componentes

- [x] 3.1 Tokens de color semánticos en `web/src/index.css` y componente `Badge.tsx` variante etiqueta con texto legible
- [x] 3.2 Diálogo accesible de administración de etiquetas `LabelManagerDialog.tsx`
- [x] 3.3 Selector y desasignación de etiquetas en `TaskFormDialog.tsx` mediante `PUT /tasks/:id/labels`
- [x] 3.4 Renderizado de píldoras en `TaskCard.tsx` y filtrado interactivo en `TaskBoard.tsx` integrado con `use-filtros-de-url.ts`
- [x] 3.5 Actualización de tipos en `web/src/types/api.ts` y cliente HTTP en `web/src/features/labels/api.ts`

## 4. Validación y documentación

- [x] 4.1 12 pruebas de integración en `api/tests/integration/labels.test.ts` cubriendo CRUD, validaciones, 409 por nombre repetido, 409 por borrado sin confirmación, y rechazo de asignación cruzada
- [x] 4.2 Prueba de regresión en `api/tests/integration/projects.test.ts` verificando que un proyecto con etiquetas y sin tareas se borra con 204 y no 500
- [x] 4.3 10 pruebas en `web/` (3 en `Badge.test.tsx`, 5 en `LabelManagerDialog.test.tsx` y 2 en `TaskFormDialogLabels.test.tsx`)
- [x] 4.4 1 prueba E2E en Playwright (`e2e/etiquetas.spec.ts`) validando flujo completo y persistencia tras recarga
- [x] 4.5 ADR-029 y ADR-030 en `docs/spec/04-arquitectura.md`, mediciones en `docs/spec/08-verificacion-postgres.md` y colección `docs/api.http`

## 5. Pendiente

- [ ] 5.1 Issue enriquecido con las 19 secciones del estándar
- [ ] 5.2 PR contra `develop` y trazabilidad de cierre

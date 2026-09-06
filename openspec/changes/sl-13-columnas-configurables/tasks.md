# Tasks: SL-13 — Columnas configurables por proyecto

## 1. Esquema

- [x] 1.1 Medir el radio de impacto antes de elegir modelo: 16 archivos frente a 9
- [x] 1.2 Verificar el precedente de industria (categorías de estado de Jira) en vez de asumirlo
- [x] 1.3 `0003_project_columns.sql` con la tabla, sus restricciones y el índice de posición `DEFERRABLE`
- [x] 1.4 Trigger `projects_create_default_columns`: todo proyecto nace con su tablero
- [x] 1.5 `0004_tasks_column_id.sql` con el relleno de las tareas existentes y la guarda que aborta si queda alguna huérfana
- [x] 1.6 Clave foránea compuesta `(column_id, status) → (id, category)`
- [x] 1.7 Trigger `tasks_set_column_from_status`, para que `INSERT` directo siga funcionando
- [x] 1.8 `projects.wip_limit` retirado tras copiar su valor a la columna «En curso»
- [x] 1.9 Verificado que el motor rechaza las dos formas de divergencia y solo acepta el cambio atómico
- [x] 1.10 Verificadas las migraciones desde una base vacía, y su reversión sin pérdida de datos

## 2. API

- [x] 2.1 Módulo `columns`: mapper, esquema Zod, repositorio y rutas
- [x] 2.2 Cuatro errores de dominio nuevos, con su título en el mapa exhaustivo del manejador
- [x] 2.3 Borrado con `?reassignTo=`, atómico y respetando el límite del destino
- [x] 2.4 Reordenamiento con el orden completo, dentro de una transacción
- [x] 2.5 El límite se comprueba bloqueando la fila de la **columna**, no la del proyecto
- [x] 2.6 `columnId` en el contrato de tareas, ganando sobre `status`
- [x] 2.7 Reasignar una tarea a otro proyecto la recoloca por categoría equivalente

## 3. Interfaz

- [x] 3.1 El tablero recibe sus columnas en vez de conocerlas
- [x] 3.2 Rejilla `grid-flow-col` con `auto-cols-[minmax(16rem,1fr)]`
- [x] 3.3 Flechas contiguas por posición; desplegable de columna en el diálogo para el salto directo
- [x] 3.4 `ColumnManagerDialog`: crear, renombrar, límite, reordenar y borrar con reasignación
- [x] 3.5 El `id` de cada zona de destino es el de la columna

## 4. Validación

- [x] 4.1 25 pruebas de integración nuevas (85 → 110)
- [x] 4.2 3 escenarios E2E (6 → 9)
- [x] 4.3 Las 85 pruebas anteriores pasan sin reescribirse, salvo las del límite
- [x] 4.4 Seed con un tablero de ejemplo, verificado en arranque en frío
- [x] 4.5 ADR-023, con la alternativa descartada y su medición
- [x] 4.6 Swagger y `docs/spec/03-contrato-api.md` actualizados

## 5. Pendiente

- [ ] 5.1 Issue enriquecido con las 19 secciones del estándar
- [ ] 5.2 Nota de revisión sobre el issue #24, cuyo límite a nivel de proyecto queda superado
- [ ] 5.3 PR contra `develop` y trazabilidad de cierre

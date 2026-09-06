# Tasks: SL-14 — Orden de tareas configurable por columna

## 1. Esquema

- [x] 1.1 Verificar contra PostgreSQL que una sola consulta sirve N órdenes distintos
- [x] 1.2 `0005_project_columns_sort.sql` con el `ENUM column_sort` y la columna
- [x] 1.3 Valor por defecto `priority_desc`: el comportamiento anterior no cambia

## 2. API

- [x] 2.1 Escalera de `CASE` sobre `pc.sort` en la consulta del listado
- [x] 2.2 Desempate estable con `created_at DESC, t.id`
- [x] 2.3 `sort` aceptado en crear y parchear columna, validado por Zod

## 3. Interfaz

- [x] 3.1 Selector en la cabecera de cada columna, con nombre accesible propio
- [x] 3.2 Es el único control de columna fuera del diálogo de gestión, porque se cambia a diario

## 4. Validación

- [x] 4.1 Pruebas de integración del orden por columna y de su persistencia
- [x] 4.2 E2E: el criterio sobrevive a la recarga
- [x] 4.3 ADR-024, con las dos alternativas descartadas y la medición que las descarta

## 5. Pendiente

- [ ] 5.1 Issue enriquecido con las 19 secciones del estándar
- [ ] 5.2 PR contra `develop` y trazabilidad de cierre

# Tasks: SL-10 — Filtros en el panel de proyectos

## 1. Conteo por prioridad en la API

- [x] 1.1 Medir las variantes de SQL contra PostgreSQL con datos a escala antes de elegir
- [x] 1.2 Tres `COUNT(...) FILTER` en el `GROUP BY` que `SUMMARY_QUERY` ya hacía
- [x] 1.3 `COALESCE(..., 0)::int` para que el proyecto sin tareas dé 0 y no `null`
- [x] 1.4 El mapper agrupa las tres columnas en `byPriority`; el contrato no copia la forma del agregado
- [x] 1.5 Derivar `TaskStatus`/`TaskPriority` de `TASK_STATUSES`/`TASK_PRIORITIES` y retirar la unión escrita a mano en `tasks.mapper.ts`

## 2. Comportamiento compartido

- [x] 2.1 `useFiltrosDeUrl` en `lib/`, con el retardo de 250 ms y la lectura de `window.location` dentro del temporizador
- [x] 2.2 Expone `busqueda` (inmediata) y `busquedaUrl` (retardada) para que cada pantalla elija
- [x] 2.3 `TaskBoard` migrado al hook; deja de tener su propia copia
- [x] 2.4 Verificado que la prueba de la condición de carrera falla al reintroducir el fallo a propósito

## 3. Primitivos de presentación

- [x] 3.1 `CampoBusqueda`, `FiltroChip` y `GrupoDePrioridad` en `components/ui/Filtros.tsx`
- [x] 3.2 `FiltroChip` retirado de `TaskBoard.tsx`
- [x] 3.3 `PriorityBadge` acepta `count`, con nombre accesible que dice de qué son esos números

## 4. Panel de proyectos

- [x] 4.1 Filtrado en cliente con `useMemo` sobre la lista ya cacheada
- [x] 4.2 El chip es una condición existencial: `byPriority[p] > 0`
- [x] 4.3 Desglose en la tarjeta, antes del bloque `mt-auto`
- [x] 4.4 `EmptyState` bifurcado, con «Limpiar filtros» y sin la invitación a crear el primero
- [x] 4.5 `aria-live` amplía el que ya existía en vez de añadir una segunda región

## 5. Validación

- [x] 5.1 API: desglose con ceros, proyecto vacío, y coincidencia entre listado y detalle
- [x] 5.2 Web: 5 casos del hook y 7 de la página
- [x] 5.3 E2E: filtrar por prioridad y texto, recargar, y limpiar
- [x] 5.4 Los 4 E2E anteriores siguen pasando tras el refactor de `TaskBoard`
- [x] 5.5 Medido en el navegador que los pies de las tarjetas siguen alineados con y sin píldoras
- [x] 5.6 Verificado a 320 px que las píldoras no desbordan ni parten la rejilla

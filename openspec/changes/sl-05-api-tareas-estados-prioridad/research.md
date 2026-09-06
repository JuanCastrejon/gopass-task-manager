# Research: SL-05 — Máquina de Estados, Integridad de Fechas y Filtros SQL

## 1. Por qué los filtros deben ir en el LEFT JOIN y no en el WHERE
Al unir proyectos con tareas, si se filtraran las tareas en la cláusula `WHERE` (p. ej. `WHERE t.status = 'DONE'`), un proyecto sin tareas completadas perdería su fila devuelta. El backend vería 0 filas y emitiría erróneamente un 404 `PROJECT_NOT_FOUND`. Al colocar las condiciones en el `ON` del `LEFT JOIN`, el proyecto siempre retorna su identificador (`project_exists`), distinguiendo limpiamente entre un proyecto vacío (200 `[]`) y un proyecto inexistente (404).

## 2. Inviolabilidad de la Fecha de Completado
Permitir que el cliente escriba `completedAt` permitiría falsear métricas de resolución. La cláusula `.strict()` en Zod asegura que si un cliente intenta enviar `completedAt`, la petición es rechazada de inmediato con un 400 normativo. El trigger PL/pgSQL es la única entidad autorizada a estampar la marca temporal dentro de la transacción.

# Research: SL-03 — Optimización de Agregaciones en PostgreSQL y Documentación OpenAPI

## 1. Problema de N+1 y Cómputo de Progreso en SQL
Si el listado de proyectos ejecutara un `SELECT` por cada proyecto para contar tareas, la latencia aumentaría linealmente con el volumen de proyectos. La solución de agrupar tareas por `project_id` en una subconsulta y unirla mediante `LEFT JOIN` garantiza un único viaje a la base.

Adicionalmente, `COUNT(t.id)` en lugar de `COUNT(*)` previene que los proyectos sin tareas cuenten la fila `NULL` como 1 tarea. La fórmula `ROUND(t.done::numeric * 100 / t.total)::int` con salvaguarda `CASE WHEN total = 0 THEN 0` previene excepciones de división por cero.

## 2. Inmunidad a Carreras de Concurrencia (TOCTOU)
Comprobar existencia de tareas antes de eliminar con un `SELECT` previo deja una ventana donde otra transacción puede insertar una tarea. Ejecutar directamente `DELETE` y capturar la excepción `23503` con `isTaskProjectFkViolation` garantiza atomicidad respaldada por las transacciones ACID de PostgreSQL.

## 3. Experiencia de Exploración con Swagger UI
Para pruebas de caja negra, montar Swagger UI directamente en el backend elimina la necesidad de compartir archivos de colección o configurar variables de entorno en clientes externos.

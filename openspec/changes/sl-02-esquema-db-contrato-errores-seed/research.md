# Research: SL-02 — Persistencia e Integridad en PostgreSQL 16 y RFC 7807

## 1. Evaluación de Enums y Ordenamiento de Prioridades
En PostgreSQL, los tipos ENUM almacenan su orden de comparación según el orden en que fueron declarados en `CREATE TYPE`. Declarar `CREATE TYPE task_priority AS ENUM ('LOW', 'MEDIUM', 'HIGH')` permite que la consulta `ORDER BY priority DESC` sitúe inmediatamente las tareas prioritarias (`HIGH`) sin requerir un bloque condicional `CASE WHEN priority = 'HIGH' THEN 1 ...` en SQL.

## 2. Diagnóstico del Código de Error 23503 (Foreign Key Violation)
Se comprobó empíricamente contra PostgreSQL 16.15 que:
1. Intentar borrar un proyecto que aún contiene tareas:
   - `code: '23503'`
   - `constraint: 'tasks_project_id_fkey'`
   - `table: 'tasks'`
   - `detail: 'Key (id)=(...) is still referenced from table "tasks".'`
2. Intentar insertar una tarea con un `project_id` inexistente:
   - `code: '23503'`
   - `constraint: 'tasks_project_id_fkey'`
   - `table: 'tasks'`
   - `detail: 'Key (project_id)=(...) is not present in table "projects".'`

Ambos eventos son indistinguibles analizando únicamente `code`, `constraint` y `table`. Depender de `detail` exigiría parsear texto en inglés generado por el motor, vulnerable a cambios de idioma o versiones. Por tanto, la desambiguación debe resolverse en cada repositorio según el método invocado.

## 3. Invariante de Completado vs Relojes Distribuidos
Si la aplicación cliente o backend asignara `completed_at`, desajustes de reloj entre instancias de contenedores o ediciones concurrentes podrían producir incoherencias. El trigger en PL/pgSQL ejecuta dentro de la transacción atómica de PostgreSQL con `now()` coherente con la base de datos.

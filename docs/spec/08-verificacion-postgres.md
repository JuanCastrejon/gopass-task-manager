# 08 — Verificación empírica de PostgreSQL

Anexo interno. Documenta comprobaciones hechas **antes** de escribir código, contra un motor real, no contra documentación de memoria.

Existe porque varias decisiones del modelo de datos se apoyaban en creencias sobre el comportamiento de PostgreSQL y del driver, y una creencia equivocada repetida en una entrevista cuesta más que la propia decisión.

**Entorno:** PostgreSQL 16.15 (Debian, imagen `postgres:16`), driver `pg` 8.x, Node 24.14.0.

## 1. Evolución de un tipo `ENUM`

| Operación | Resultado | Código |
|---|---|---|
| `ALTER TYPE task_status ADD VALUE 'BLOCKED'` dentro de `BEGIN … COMMIT` | ✅ funciona | — |
| `ADD VALUE` + `INSERT` usando ese valor **en la misma transacción** | ❌ falla | `unsafe use of new value "CANCELLED" of enum type task_status`<br>`HINT: New enum values must be committed before they can be used` |
| `ALTER TYPE task_status RENAME VALUE 'DONE' TO 'COMPLETED'` dentro de transacción | ✅ funciona | — |
| `ALTER TYPE task_status DROP VALUE 'DONE'` | ❌ no existe la sintaxis | `42601 syntax error at or near "VALUE"` |

**Conclusión.** La creencia de que `ADD VALUE` no puede correr dentro de una transacción es cierta solo hasta PostgreSQL 11; desde la 12 está permitida. El límite real y permanente del `ENUM` es que **no se puede retirar un valor**: hay que crear un tipo nuevo, hacer `ALTER COLUMN … USING columna::text::nuevo_tipo`, borrar el viejo y renombrar.

**Consecuencia operativa.** `node-pg-migrate` envuelve cada migración en una transacción. Añadir un valor y usarlo exige **dos migraciones separadas**, no una sola con `noTransaction()`.

## 2. Orden de los valores

Con `CREATE TYPE task_priority AS ENUM ('LOW','MEDIUM','HIGH')`:

```sql
SELECT title, priority FROM tasks ORDER BY priority DESC, title;
--  a | HIGH
--  e | HIGH
--  c | MEDIUM
--  b | LOW
--  d | LOW

SELECT 'HIGH'::task_priority > 'LOW'::task_priority;   -- t
SELECT 'TODO'::task_status  < 'DONE'::task_status;     -- t
```

El orden de comparación es el de declaración. Con `text` + `CHECK`, el mismo `ORDER BY` daría orden alfabético (`HIGH, LOW, MEDIUM`) y obligaría a un `CASE` o una columna de peso en cada consulta que ordene por prioridad.

Esta es la ventaja concreta que justifica el `ENUM` frente a `text` + `CHECK` en este proyecto, por encima del argumento estético de "documenta el dominio".

## 3. El filtro repetible desde el driver `pg`

El punto disputado: si `?status=TODO&status=IN_PROGRESS` obliga a castear el parámetro.

| Consulta desde `node-pg`, parámetro `['TODO','IN_PROGRESS']` | Resultado |
|---|---|
| `WHERE status = ANY($1)` | ✅ `4` filas |
| `WHERE status = ANY($1::task_status[])` | ✅ `4` filas |
| `WHERE status::text = ANY($1)` | ✅ `4` filas |

**No hace falta cast.** El driver envía el parámetro sin tipo declarado y PostgreSQL infiere `task_status[]` del contexto de la comparación.

El error `operator does not exist: task_status = text` **sí** aparece, pero solo al usar `PREPARE` en psql, donde el tipo del parámetro se fija en el momento de preparar la sentencia y se infiere como `text[]`. Es un artefacto de `PREPARE`, no del driver, y no aplica a este código.

Con un valor inválido:

| Consulta | Resultado |
|---|---|
| `= ANY($1)` con `['BANANA']` | ❌ `22P02 invalid input value for enum task_status: "BANANA"` |
| `status::text = ANY($1)` con `['BANANA']` | ✅ devuelve `0` filas, sin error |

Se elige la primera forma —sin `::text`— porque un filtro inválido **debe** fallar, no devolver cero resultados en silencio. Aun así Zod lo rechaza antes, para que el 400 salga con el detalle del campo en vez de como un error de base de datos traducido.

## 4. `SQLSTATE` de las escrituras inválidas

| Situación | Código |
|---|---|
| `INSERT` con `status = 'BANANA'` | `22P02` |
| Comparación con un uuid mal formado (`'no-soy-uuid'::uuid`) | `22P02` |

Ambos casos comparten código, y ambos deben traducirse a `400 VALIDATION_ERROR`. La tabla de mapeo de `03-contrato-api.md` §5 queda confirmada.

## 5. Cómo devuelve el driver los valores `ENUM`

| Consulta | Valor en JavaScript |
|---|---|
| `SELECT status, priority FROM tasks` | `"TODO"` / `"HIGH"` — `typeof === 'string'` |
| `SELECT array_agg(status) FROM tasks` | ⚠️ `"{TODO,IN_PROGRESS,DONE}"` — **string**, no array |
| `SELECT array_agg(status)::text[] FROM tasks` | ✅ `["TODO","IN_PROGRESS","DONE"]` — array real |

El escalar se comporta como se espera y encaja directamente con los tipos de TypeScript y los esquemas de Zod.

**La trampa está en la segunda fila.** El OID de un `ENUM` es propio del esquema y `pg` no tiene un parser registrado para su tipo array, así que devuelve el literal crudo de PostgreSQL. Cualquier consulta que agregue una columna `ENUM` en un array —por ejemplo, en el endpoint de estadísticas— **debe** castear a `::text[]`, o el repositorio devolverá un string donde el tipo declara una lista y el error aparecerá lejos de su causa.

Metadatos del tipo, por si hiciera falta registrar un parser:

```
 oid   | typname       | typtype | typcategory
-------+---------------+---------+-------------
 16385 | task_status   | e       | E
 16392 | task_priority | e       | E
```

## 6. Los dos casos de `23503` son indistinguibles

La medición más importante del proyecto. Se provocaron las dos violaciones de clave foránea que la API debe traducir a códigos HTTP distintos, y se volcaron todos los campos que expone el driver:

| Campo | `DELETE` de proyecto con tareas → **409** | `INSERT` de tarea con padre ausente → **404** |
|---|---|---|
| `code` | `23503` | `23503` |
| `constraint` | `tasks_project_id_fkey` | `tasks_project_id_fkey` |
| `table` | `tasks` | `tasks` |
| `schema` | `public` | `public` |
| `routine` | `ri_ReportViolation` | `ri_ReportViolation` |
| `detail` | `Key (id)=(…) is still referenced from table "tasks".` | `Key (project_id)=(…) is not present in table "projects".` |

**Cinco campos idénticos. El único que distingue es `detail`**, una cadena en inglés generada por el motor, sujeta a cambios de versión y de locale.

**Consecuencia de diseño.** Un traductor genérico de `SQLSTATE`→HTTP **no puede** resolver este caso, y parsear `detail` sería construir el contrato sobre un texto que nadie garantiza. La desambiguación vive por tanto en cada repositorio, que sí sabe qué operación estaba ejecutando:

```ts
// projects.repository.ts — aquí un 23503 solo puede significar una cosa
catch (err) {
  if (isTaskProjectFkViolation(err)) throw new ProjectHasTasksError(err);  // 409
  throw err;
}

// tasks.repository.ts — aquí el mismo error significa la contraria
catch (err) {
  if (isTaskProjectFkViolation(err)) throw new ProjectNotFoundError(id, err); // 404
  throw err;
}
```

`translatePgError()` devuelve `null` para `23503` a propósito, y hay una prueba unitaria que fija esa decisión para que nadie la "arregle" más adelante.

Los demás códigos sí traen un `constraint` utilizable y se traducen sin contexto: `23505` → `projects_name_unique_ci`, `23514` → `projects_name_not_blank`. `22P02` no trae ni `constraint` ni `table`, solo `routine` (`string_to_uuid` o `enum_in`); da igual, porque Zod lo rechaza antes.

**Y `detail` filtra datos.** Una violación de `CHECK` devuelve `Failing row contains (fc3b01d6-…, )`: el contenido de la fila que falló. Ni `detail` ni `constraint` pueden llegar nunca al cliente. Hay una prueba que lo verifica.

## 7. El trigger de `completed_at`, verificado

La invariante `status = 'DONE' ⟺ completed_at IS NOT NULL` la **verifica** un `CHECK` y la **satisface** un trigger `BEFORE INSERT OR UPDATE OF status`. Comprobado contra el motor:

| Caso | Resultado |
|---|---|
| `INSERT` con estado por defecto `TODO` | `completed_at` queda `NULL` |
| `INSERT` directo con `DONE`, sin que la aplicación pase la fecha | `completed_at` sellado |
| `UPDATE` que no toca `status` | `completed_at` **no** se mueve |
| `UPDATE` de `DONE` a `DONE` | `completed_at` **no** se mueve |
| `UPDATE` saliendo de `DONE` | `completed_at` vuelve a `NULL` |
| `UPDATE` volviendo a `DONE` | `completed_at` re-sellado con la fecha nueva |
| `UPDATE completed_at = NULL` con `status = 'DONE'` | rechazado, `23514 tasks_done_completed_at` |

La segunda fila es la que justifica la decisión: **el seed no escribe `completed_at` en ninguna parte** y las cuatro tareas sembradas como `DONE` lo tienen. Si la regla viviera en el servicio, el seed —y `psql`, y cualquier migración de datos— violaría el `CHECK` y produciría un 500 en vez de un dato correcto.

## 8. `gen_random_uuid()` no necesita `pgcrypto`

```
SELECT extname FROM pg_extension;   →  plpgsql   (nada más)
SELECT gen_random_uuid();           →  funciona
SELECT proname, nspname …           →  gen_random_uuid | pg_catalog
```

`CREATE EXTENSION IF NOT EXISTS pgcrypto` es un reflejo heredado de PostgreSQL 12 y anteriores. Desde la 13 la función está en `pg_catalog`. La migración no la declara.

## 9. Qué cambió en la especificación por estas mediciones

| Documento | Cambio |
|---|---|
| `02-modelo-dominio.md` | Se sustituyó la justificación del `ENUM`: el argumento ya no es "el coste de `ADD VALUE` es aceptable" —premisa falsa— sino "el coste real es que no se puede retirar un valor, y se asume". Se añadió el orden de declaración como ventaja concreta y la advertencia de `array_agg`. |
| `03-contrato-api.md` | Se añadió el contrato de casos borde del filtro y la confirmación de que `= ANY($1)` no requiere cast. Se confirmó la tabla `SQLSTATE`→HTTP. |
| `07-defensa-tecnica.md` | Se reescribió la respuesta sobre `ENUM` para que se apoye en el límite real y no en el falso. |
| `04-arquitectura.md` | ADR-004 pasó de "el mapeo vive en `pg-error.ts`" a "`pg-error.ts` traduce lo identificable y cada repositorio desambigua su `23503`", por la medición del §6. Se añadieron ADR-009 y ADR-010. |
| `api/migrations/0001_initial_schema.sql` | Sin `CREATE EXTENSION pgcrypto`. FK nombrada explícitamente porque el código depende de ese nombre. Trigger `set_task_completed_at`. |

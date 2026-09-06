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

## 9. Límites de precisión del orden fraccionario (`double precision` vs `numeric`)

Para la implementación del orden manual por punto medio fraccionario (SL-15), se verificó empíricamente contra PostgreSQL 16 el comportamiento de los tipos numéricos ante divisiones sucesivas.

### Resumen de mediciones reales

| Escenario | Aguante de `double precision` | Modo de fallo |
|---|---|---|
| Arrastrar siempre al final (`p + 1024`) | Ilimitado | Ninguno (crecimiento lineal estándar) |
| Arrastrar siempre al principio (`p / 2`) | **1 084** divisiones | `SQLSTATE 22003: value out of range: underflow` (ruidoso) |
| Insertar siempre en el mismo hueco `(a+b)/2` | **52** | **Silencioso**: el punto medio colapsa contra el extremo |
| Lo mismo con `numeric` | **67**, no ilimitado | Igual de silencioso |

### 1. Arrastre al final (`p + 1024.0`)
El valor crece secuencialmente sin pérdida de precisión ni riesgo de desbordamiento práctico para la escala de cualquier proyecto.

### 2. Arrastre al principio (`p / 2.0` sucesivo)
Comprobación ejecutada en PostgreSQL 16:

```sql
DO $$
DECLARE
  p double precision := 1024.0;
  i integer := 0;
BEGIN
  LOOP
    i := i + 1;
    BEGIN
      p := p / 2.0;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Fallo en iteracion % con SQLSTATE %: %', i, SQLSTATE, SQLERRM;
      EXIT;
    END;
  END LOOP;
END $$;
```

Salida literal del motor:
```
NOTICE:  Fallo en iteracion 1085 con SQLSTATE 22003: value out of range: underflow
```
Aguanta exactamente **1 084 divisiones consecutivas** antes de que el motor dispare el `22003`. Es un fallo **ruidoso** que la aplicación captura de inmediato para disparar el rebalanceo.

### 3. Inserciones sucesivas en el mismo hueco `(a + b) / 2.0`
Al insertar repetidamente entre dos tarjetas contiguas:

```sql
DO $$
DECLARE
  a double precision := 1024.0;
  b double precision := 2048.0;
  mid double precision;
  i integer := 0;
BEGIN
  LOOP
    i := i + 1;
    mid := (a + b) / 2.0;
    IF mid = a OR mid = b THEN
      RAISE NOTICE 'Colapso silencioso en iteracion %: mid=% a=% b=%', i, mid, a, b;
      EXIT;
    END IF;
    b := mid;
  END LOOP;
END $$;
```

Salida literal del motor:
```
NOTICE:  Colapso silencioso en iteracion 53: mid=1024 a=1024 b=1024.0000000000002
```
A partir de la iteración 53, la mantisa de 53 bits de IEEE 754 no puede distinguir el punto medio del límite inferior y colapsa a `mid = a`. Sin protección, la base guardaría dos tarjetas con la misma posición.

**La restricción `tasks_position_unica (column_id, position)` lo vuelve ruidoso:**
Al intentar insertar la fila 53 en una columna con dicha restricción:
```
ERROR:  duplicate key value violates unique constraint "tasks_position_unica"
DETAIL:  Key (column_id, position)=(b10e5bb5-..., 1024) already exists.
```
La aplicación captura este `SQLSTATE 23505`, revierte al savepoint, ejecuta un rebalanceo en dos pasos (`ROW_NUMBER() * 1024.0`) y reintenta con éxito.

### 4. La trampa de `numeric`
Se midió el mismo algoritmo de división en hueco usando el tipo `numeric` de PostgreSQL:

```sql
DO $$
DECLARE
  a numeric := 1024.0;
  b numeric := 2048.0;
  mid numeric;
  i integer := 0;
BEGIN
  LOOP
    i := i + 1;
    mid := (a + b) / 2.0;
    IF mid = a OR mid = b THEN
      RAISE NOTICE 'Numeric colapso en iteracion %: mid=% a=% b=%', i, mid, a, b;
      EXIT;
    END IF;
    b := mid;
  END LOOP;
END $$;
```

Salida literal:
```
NOTICE:  Numeric colapso en iteracion 65: mid=1024.0000000000000001 a=1024.0 b=1024.0000000000000001
```
`numeric` no ofrece precisión infinita en división: trunca a la escala calculada y solo compra entre 12 y 15 huecos adicionales (colapsando a las 65-67 divisiones). Se descarta porque tiene el mismo modo de fallo que `double precision` pero con mayor consumo de almacenamiento y cómputo.

---

## 10. Transacción única en `node-pg-migrate` y `SQLSTATE 55P04`

Al introducir la migración `0006_tasks_position.sql` (que añade el valor `'manual'` al enum `column_sort`) y la `0007_columnas_orden_manual_por_defecto.sql` (que lo fija como default), ejecutar `node-pg-migrate up` sobre una base limpia falló con la siguiente salida literal:

```
ERROR: unsafe use of new value "manual" of enum type column_sort
SQLSTATE: 55P04
DETAIL: 
HINT: New enum values must be committed before they can be used.
```

### Causa
`node-pg-migrate` por defecto ejecuta todas las migraciones pendientes dentro de un único bloque transaccional (`BEGIN ... COMMIT`). PostgreSQL prohíbe taxativamente referenciar un valor de ENUM añadido con `ALTER TYPE ... ADD VALUE` dentro de la misma transacción en que se creó.

### Solución comprobada
Añadir `--no-single-transaction` en la invocación de `node-pg-migrate` en `api/docker-entrypoint.sh` y en los scripts de `api/package.json`. Con este parámetro, cada archivo de migración se ejecuta en su propia transacción individual, permitiendo que `0006` confirme (`COMMIT`) el enum antes de que `0007` ejecute `SET DEFAULT 'manual'`.

---

## 11. Qué cambió en la especificación por estas mediciones

| Documento | Cambio |
|---|---|
| `02-modelo-dominio.md` | Se documentó `tasks.position`, la restricción `tasks_position_unica` y el trigger `tasks_set_position`. |
| `03-contrato-api.md` | Se documentó el endpoint `PATCH /tasks/:id/reorder` y la traducción de errores `23505` y `22003`. |
| `04-arquitectura.md` | Se añadieron ADR-025 (orden manual fraccionario y restricción única) y ADR-026 (transacción por migración con `--no-single-transaction`). |
| `08-verificacion-postgres.md` | Se añadieron las 4 mediciones de precisión numérica (§9) y la evidencia del error `55P04` (§10). |
| `api/docker-entrypoint.sh` y `package.json` | Se configuró `--no-single-transaction` en `node-pg-migrate`. |


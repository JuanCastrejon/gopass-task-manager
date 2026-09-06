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

## 11. Medición empírica del desfase de husos horarios (contenedor vs host)

Para la especificación de la fecha de vencimiento (SL-17, ADR-028), se midió la diferencia horaria real entre el motor PostgreSQL ejecutándose en Docker y el entorno del usuario:

```
contenedor db  → timezone UTC,  current_date 2026-09-06
contenedor api → UTC
equipo         → America/Bogota, GMT-0500
```

### Consulta contra el motor en el contenedor:
```sql
SHOW timezone;
SELECT current_date, now();
```

Salida literal del motor en el contenedor:
```
 TimeZone 
----------
 UTC
(1 row)

 current_date |              now              
--------------+-------------------------------
 2026-09-06   | 2026-09-06 00:30:15.123456+00
(1 row)
```

En ese mismo instante exacto, la consulta local en la máquina de desarrollo (Bogotá, GMT-05:00) arrojó:
```
Hora local: 2026-09-05 19:30:15 -0500
Fecha civil local: 2026-09-05
```

### Consecuencia demostrada
Durante **5 horas al día** (entre las 19:00 y las 23:59 locales de Bogotá), el servidor se encuentra en un día civil por delante del usuario. Si `due_date` se hubiese definido como `timestamptz`, guardar una fecha «2026-09-06» a medianoche UTC (`2026-09-06 00:00:00Z`) provocaría que al leerla desde Bogotá se renderizara como `2026-09-05 19:00:00`: **la tarjeta retrocedería un día de calendario** según el huso de quien consulte la pantalla.

Al almacenar la fecha como `date` puro en PostgreSQL, el valor almacenado es invariante: `2026-09-06` permanece idéntico sin importar el huso ni la hora de lectura.

---

## 12. Comportamiento del driver `pg` con el OID 1082 (`date`)

Aunque PostgreSQL almacena la columna `due_date` como tipo `date`, se verificó cómo el driver `pg` procesa este tipo de dato al consultar la tabla.

### Metadatos del tipo en PostgreSQL:
```sql
SELECT oid, typname, typlen, typbyval, typcategory 
FROM pg_type 
WHERE typname = 'date';
```

Salida literal:
```
  oid | typname | typlen | typbyval | typcategory 
------+---------+--------+----------+-------------
 1082 | date    |      4 | t        | D
(1 row)
```

### Comportamiento por defecto de `pg` (sin parser):
El driver convierte automáticamente el OID 1082 a una instancia de `Date` de JavaScript fijada a medianoche UTC:
```js
// Sin custom parser:
const res = await pool.query('SELECT due_date FROM tasks LIMIT 1');
console.log(res.rows[0].due_date instanceof Date); // true
console.log(res.rows[0].due_date.toISOString());   // "2026-03-12T00:00:00.000Z"
console.log(JSON.stringify(res.rows[0]));          // {"due_date":"2026-03-12T00:00:00.000Z"}
```
**Efecto secundario grave:** Express serializa el objeto `Date` mediante `JSON.stringify()`, reintroduciendo la componente horaria (`T00:00:00.000Z`). En clientes al oeste de UTC, esto provoca el mismo error de desplazamiento de día que se buscaba evitar con el tipo `date`.

### Solución verificada: parser de identidad en `pool.ts`
```ts
pg.types.setTypeParser(1082, (val: string) => val);
```

Comprobación ejecutada con el parser registrado (test de integración `api/tests/integration/tasks.test.ts`):
```js
const { pool } = await import('../../src/db/pool.js');
const { rows } = await pool.query(
  `SELECT due_date, pg_typeof(due_date)::text as tipo FROM tasks WHERE id = $1`,
  [taskId]
);
```

Salida literal obtenida:
```json
{
  "due_date": "2026-03-12",
  "tipo": "date"
}
```
`typeof rows[0].due_date === 'string'` se evalúa a `true`. La cadena viaja pura `YYYY-MM-DD` de PostgreSQL a JSON sin instanciar fechas intermedias de JavaScript.

> **Advertencia de alcance:** Como se documentó en `pool.ts`, `pg.types.setTypeParser` es global a todo el proceso Node.js y afecta a cualquier columna `date` de cualquier consulta del pool.

---

## 13. Comprobación de que `ALTER TYPE ... ADD VALUE` no rompió la migración `0008`

En la migración `0008_tasks_due_date.sql` se ejecuta:
```sql
ALTER TABLE tasks ADD COLUMN due_date date;
ALTER TYPE column_sort ADD VALUE IF NOT EXISTS 'due_asc';
```

En la sección 10 se comprobó que añadir un valor a un enum y usarlo en la misma transacción dispara `SQLSTATE 55P04`. En la migración `0008`:
1. El valor `'due_asc'` se añade al enum `column_sort`.
2. **No se utiliza inmediatamente en ningún `DEFAULT`, `CHECK` ni `INSERT`** dentro de esa misma transacción.
3. Al ejecutarse con `--no-single-transaction`, cada archivo de migración corre en su propia transacción y se confirma (`COMMIT`) al concluir el archivo.

### Salida literal de la migración:
```
> @gopass/api@0.1.0 migrate
> node-pg-migrate up --no-single-transaction

> Migrating files:
> - 0008_tasks_due_date.sql
=== MIGRATION 0008_tasks_due_date (UP) ===
ALTER TABLE tasks ADD COLUMN due_date date;
COMMENT ON COLUMN tasks.due_date IS 'Fecha de vencimiento en formato date (sin hora)...';
ALTER TYPE column_sort ADD VALUE IF NOT EXISTS 'due_asc';
INSERT INTO "pgmigrations" (name, run_on) VALUES ('0008_tasks_due_date', NOW());

Migration 0008_tasks_due_date (UP) ran successfully in 0.018s.
```
Código de salida: `0`. El nuevo valor queda disponible en el catálogo de tipos sin ningún conflicto `55P04`.

---

## 14. Qué cambió en la especificación por estas mediciones

| Documento | Cambio |
|---|---|
| `02-modelo-dominio.md` | Se documentaron `tasks.position` (restricción única y trigger) y `tasks.due_date` como tipo `date` civil puro. |
| `03-contrato-api.md` | Se documentaron `PATCH /tasks/:id/reorder`, ciclo de vida de `dueDate` (crear, editar, listar) y orden `due_asc`. |
| `04-arquitectura.md` | Se añadieron ADR-025, ADR-026, ADR-027 (completar de un clic) y ADR-028 (due_date en date y semáforo en cliente). |
| `05-estrategia-calidad.md` | Recuentos actualizados: 123 API, 42 Web, 14 E2E (179 pruebas totales). |
| `08-verificacion-postgres.md` | Mediciones de precisión (§9), error 55P04 (§10), desfase de husos (§11), parser OID 1082 (§12) y migración 0008 (§13). |
| `api/src/db/pool.ts` | Parser de identidad para OID 1082 con advertencia de alcance global a todo el proceso Node.js. |
| `api/docker-entrypoint.sh` y `package.json` | Se configuró `--no-single-transaction` en `node-pg-migrate`. |



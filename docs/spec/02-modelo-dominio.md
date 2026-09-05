# 02 — Modelo de dominio y esquema de PostgreSQL

## 1. Dominio

```
┌──────────────────────────┐
│        Project           │
│                          │
│  id            uuid PK   │
│  name          text      │  único (case-insensitive)
│  description   text?     │
│  created_at    timestamptz
│  updated_at    timestamptz
└────────────┬─────────────┘
             │ 1
             │
             │ N          ON DELETE RESTRICT
┌────────────▼─────────────┐
│         Task             │
│                          │
│  id            uuid PK   │
│  project_id    uuid FK   │
│  title         text      │
│  description   text?     │
│  status        enum      │  TODO | IN_PROGRESS | DONE
│  priority      enum      │  LOW | MEDIUM | HIGH
│  completed_at  timestamptz?
│  created_at    timestamptz
│  updated_at    timestamptz
└──────────────────────────┘
```

Dos entidades. No más. Un dominio de dos tablas con invariantes bien puestas comunica más criterio que cinco tablas a medio justificar.

## 2. Decisiones de modelado

### Identificadores: `uuid` con `gen_random_uuid()`

Se usa UUID en lugar de `serial`. Un identificador secuencial expuesto en la URL revela volumen de negocio y permite enumerar recursos. En una empresa de pagos y movilidad esa es una consideración normal, no paranoia. `gen_random_uuid()` es nativo desde PostgreSQL 13; no hace falta la extensión `uuid-ossp`.

Coste: cero. Beneficio: una decisión defendible en una frase.

### Estados y prioridades: `ENUM` nativo de PostgreSQL, no `text`

```sql
CREATE TYPE task_status   AS ENUM ('TODO', 'IN_PROGRESS', 'DONE');
CREATE TYPE task_priority AS ENUM ('LOW', 'MEDIUM', 'HIGH');
```

Alternativas descartadas:

| Opción | Por qué no |
|---|---|
| `text` sin restricción | `{"status": "banana"}` entraría a la tabla si alguien saltara la API. La base deja de ser fuente de verdad. |
| `text` con `CHECK IN (...)` | Válido, y más barato de evolucionar. Se descarta porque el `ENUM` documenta el dominio en el propio tipo y porque su orden de declaración resuelve gratis el ordenamiento por prioridad (ver más abajo). |
| Tabla de catálogo `statuses` | Correcto si los estados fueran configurables por el usuario. Aquí no lo son; añadiría un JOIN a cada consulta sin resolver ningún problema. |

Postura defendible: *"Si mañana los estados fueran configurables por cliente, migraría a tabla de catálogo. Hoy son parte del dominio, no de la configuración."*

#### Lo que cuesta de verdad un `ENUM`, verificado contra PostgreSQL 16.15

La objeción habitual al `ENUM` es que no se puede evolucionar. Es cierta solo a medias, y conviene saber exactamente dónde está el límite antes de defenderlo:

| Operación | Resultado real |
|---|---|
| `ALTER TYPE ... ADD VALUE` dentro de una transacción | **Funciona.** La prohibición existió hasta PostgreSQL 11; desde la 12 está permitida |
| Usar el valor recién añadido en esa **misma** transacción | Falla: `unsafe use of new value ... New enum values must be committed before they can be used` |
| `ALTER TYPE ... RENAME VALUE` | Funciona, dentro de transacción, desde PostgreSQL 10 |
| `ALTER TYPE ... DROP VALUE` | **No existe.** Devuelve `42601 syntax error at or near "VALUE"` |
| Reordenar valores existentes | No se puede sin recrear el tipo |

El único coste real, entonces, es que **un valor de `ENUM` no se puede retirar**: para eliminar `IN_PROGRESS` habría que crear un tipo nuevo, hacer `ALTER COLUMN ... USING columna::text::nuevo_tipo`, borrar el viejo y renombrar. Se asume ese coste conscientemente porque estos tres estados no van a desaparecer.

Consecuencia práctica para `node-pg-migrate`, que envuelve cada migración en una transacción: añadir un valor y usarlo hay que partirlo en **dos migraciones**, no en una con `noTransaction()`.

#### Ventaja concreta: orden sin `CASE`

El orden de declaración del `ENUM` es el orden de comparación. Declarando `('LOW','MEDIUM','HIGH')`:

```sql
SELECT title, priority FROM tasks ORDER BY priority DESC;
-- HIGH, HIGH, MEDIUM, LOW, LOW
```

Con `text` + `CHECK` esto ordena alfabéticamente (`HIGH, LOW, MEDIUM`) y obliga a escribir un `CASE` o una columna de peso en cada consulta que ordene por prioridad. Verificado: `'HIGH'::task_priority > 'LOW'::task_priority` devuelve `true`.

#### Comportamiento con el driver `pg`, verificado

Tres cosas que conviene tener comprobadas antes de escribir el primer repositorio:

| Situación | Comportamiento real |
|---|---|
| `WHERE status = ANY($1)` con un `string[]` de JavaScript | **Funciona sin cast.** El driver envía el parámetro sin tipo y PostgreSQL infiere `task_status[]` del contexto. No hace falta `$1::task_status[]` |
| Valor inválido en ese filtro (`['BANANA']`) | Error `22P02` — el mismo código que un uuid mal formado, ya contemplado en el mapeo de `03-contrato-api.md` |
| `SELECT array_agg(status)` | ⚠️ El driver devuelve el literal crudo `"{TODO,IN_PROGRESS,DONE}"` como **string**, no como array, porque el OID del tipo es propio del esquema |

La tercera fila es la única trampa real: **cualquier consulta que agregue una columna `ENUM` en un array debe castear a `::text[]`**, o el repositorio devolverá un string donde TypeScript espera una lista. Con `::text[]` el driver devuelve un array de JavaScript correctamente.

### Nombre de proyecto único, case-insensitive

```sql
CREATE UNIQUE INDEX projects_name_unique_ci ON projects (lower(btrim(name)));
```

Evita que existan "Telepeaje" y "telepeaje ". Da un segundo camino real de conflicto (`409 PROJECT_NAME_TAKEN`) que se puede demostrar en la demo y que se resuelve capturando `SQLSTATE 23505`, no consultando antes de insertar — porque consultar antes de insertar es una condición de carrera.

### Invariante de estado terminal

```sql
CONSTRAINT tasks_done_completed_at CHECK (
  (status = 'DONE'  AND completed_at IS NOT NULL) OR
  (status <> 'DONE' AND completed_at IS NULL)
)
```

Es la única regla de máquina de estados del dominio y está impuesta por el motor. Ninguna ruta de escritura —API, script de seed, `psql` a mano— puede dejar una tarea marcada como completada sin fecha de completado. Es exactamente el tipo de garantía que el enunciado premia cuando dice "muestra tu criterio".

### `completed_at` lo sella la base, no el servicio

El `CHECK` de arriba **verifica** la invariante; alguien tiene que **satisfacerla**. Lo hace un trigger:

```sql
CREATE FUNCTION set_task_completed_at() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'DONE' THEN
    -- Solo en la transición: reeditar una tarea ya completada no mueve su fecha.
    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'DONE' THEN
      NEW.completed_at := now();
    END IF;
  ELSE
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_set_completed_at
  BEFORE INSERT OR UPDATE OF status ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_task_completed_at();
```

Si la regla viviera en el servicio, quedarían fuera el seed, `psql` y cualquier migración de datos: esas escrituras violarían el `CHECK` y devolverían un 500 en lugar de un dato correcto. La prueba de que funciona es que **el seed no menciona `completed_at` en ninguna parte** y sus tareas `DONE` lo tienen.

### `updated_at` por trigger, no por aplicación

```sql
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
```

Si `updated_at` lo escribe la aplicación, cualquier `UPDATE` ejecutado fuera de ella lo deja mintiendo. El trigger lo hace incondicional.

### Índices

```sql
CREATE INDEX tasks_project_id_idx      ON tasks (project_id);
CREATE INDEX tasks_project_status_idx  ON tasks (project_id, status);
```

`tasks_project_id_idx` no es opcional: PostgreSQL **no** indexa automáticamente el lado hijo de una clave foránea, y sin él cada verificación de `ON DELETE RESTRICT` hace un recorrido secuencial. `tasks_project_status_idx` sirve a la consulta que domina la aplicación: las tareas de un proyecto agrupadas por estado.

## 3. DDL completo

```sql
-- migrations/0001_init.sql

CREATE TYPE task_status   AS ENUM ('TODO', 'IN_PROGRESS', 'DONE');
CREATE TYPE task_priority AS ENUM ('LOW', 'MEDIUM', 'HIGH');

CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE projects (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT projects_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT projects_name_max_len   CHECK (char_length(name) <= 120)
);

CREATE UNIQUE INDEX projects_name_unique_ci ON projects (lower(btrim(name)));

CREATE TRIGGER projects_set_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE tasks (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid          NOT NULL,
  title        text          NOT NULL,
  description  text,
  status       task_status   NOT NULL DEFAULT 'TODO',
  priority     task_priority NOT NULL DEFAULT 'MEDIUM',
  completed_at timestamptz,
  created_at   timestamptz   NOT NULL DEFAULT now(),
  updated_at   timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT tasks_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE RESTRICT,

  CONSTRAINT tasks_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT tasks_title_max_len   CHECK (char_length(title) <= 200),
  CONSTRAINT tasks_done_completed_at CHECK (
    (status = 'DONE'  AND completed_at IS NOT NULL) OR
    (status <> 'DONE' AND completed_at IS NULL)
  )
);

CREATE INDEX tasks_project_id_idx     ON tasks (project_id);
CREATE INDEX tasks_project_status_idx ON tasks (project_id, status);

CREATE TRIGGER tasks_set_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

## 4. Consulta de resumen de proyecto

El listado de proyectos con avance se resuelve en **una consulta**, no en N+1:

```sql
SELECT
  p.id, p.name, p.description, p.created_at, p.updated_at,
  COALESCE(t.total, 0)                       AS task_count,
  COALESCE(t.done,  0)                       AS done_count,
  CASE WHEN COALESCE(t.total, 0) = 0 THEN 0
       ELSE ROUND(t.done::numeric * 100 / t.total)
  END                                        AS progress
FROM projects p
LEFT JOIN (
  SELECT project_id,
         COUNT(*)                                        AS total,
         COUNT(*) FILTER (WHERE status = 'DONE')         AS done
  FROM tasks
  GROUP BY project_id
) t ON t.project_id = p.id
ORDER BY p.created_at DESC;
```

`COUNT(*) FILTER (WHERE ...)` es agregación condicional estándar de PostgreSQL y evita el `SUM(CASE WHEN ...)` que suele delatar a quien no conoce el motor. `LEFT JOIN` + `COALESCE` garantiza que un proyecto sin tareas devuelva `0`, no `null` — cumple RF-02.

## 5. Datos de ejemplo

El seed es **idempotente** (`ON CONFLICT DO NOTHING` sobre el nombre del proyecto) y carga un escenario reconocible para el evaluador, con tareas repartidas entre los tres estados y las tres prioridades:

- **Telepeaje — integración de operadores**
- **App de parqueaderos — flujo de pago**
- **Conciliación de transacciones**
- **Migración de facturación electrónica**

Un proyecto se deja **sin tareas** a propósito: es el caso que demuestra el estado vacío y el `progress: 0` de RF-02.

## 6. Lo que se documenta como "no hecho, y por qué"

| Tema | Postura escrita en `docs/decisions.md` |
|---|---|
| Fecha de vencimiento | La columna **no** está en el esquema. Añadir una columna nullable sin default es una operación de catálogo instantánea en PostgreSQL desde la versión 11, así que "dejar la base preparada" no compra nada; en cambio, un `dueDate: null` en toda respuesta de la API que ningún cliente consume se lee como alcance abandonado. Si entra, entra completa —migración `0002`, contrato y UI— antes del feature freeze. |
| Soft delete | Se haría con `deleted_at` y vistas filtradas si existiera requisito de auditoría o retención regulatoria. No existe aquí, y contamina todas las consultas. |
| Particionado / paginación | Innecesario a este volumen. El umbral práctico está en el orden de decenas de miles de tareas por proyecto; a partir de ahí, paginación por cursor sobre `(created_at, id)`. |
| Concurrencia en edición | Hoy gana la última escritura. Con edición concurrente real se añadiría una columna `version` y respuesta `412 Precondition Failed`. Se menciona porque conocer el límite del diseño es parte del criterio. |

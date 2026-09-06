# 02 — Modelo de dominio y esquema de PostgreSQL

## 1. Dominio

```
┌──────────────────────────┐                      ┌──────────────────────────┐
│        Project           │                      │         Label            │
│                          │                      │                          │
│  id            uuid PK   │                      │  id            uuid PK   │
│  name          text      │  único (CI)          │  project_id    uuid FK   │  ON DELETE CASCADE
│  description   text?     │                      │  name          text      │  único por proyecto (CI)
│  created_at    timestamptz                      │  color         text      │  paleta de 12 (CHECK)
│  updated_at    timestamptz                      │  (id, project_id) UNIQUE │
└────────────┬─────────────┘                      └────────────┬─────────────┘
             │ 1                                               │ 1
             │                                                 │
             │ N          ON DELETE RESTRICT                   │ N
┌────────────▼─────────────┐                      ┌────────────▼─────────────┐
│         Task             │                      │       TaskLabel          │
│                          │ 1                  N │                          │
│  id            uuid PK   ├──────────────────────┤  task_id      uuid PK,FK │  ON DELETE CASCADE
│  project_id    uuid FK   │                      │  label_id     uuid PK,FK │  ON DELETE CASCADE
│  column_id     uuid FK   │                      │  project_id   uuid       │  FK compuesta
│  title         text      │                      │                          │
│  description   text?     │                      │  (task_id, project_id)   │  -> tasks
│  status        enum      │  TODO|IN_PROGRESS|…  │  (label_id, project_id)  │  -> labels
│  priority      enum      │  LOW|MEDIUM|HIGH     └──────────────────────────┘
│  position      double    │  único por columna
│  due_date      date?     │  civil (YYYY-MM-DD)
│  completed_at  timestamptz?
│  created_at    timestamptz
│  updated_at    timestamptz
│  (id, project_id) UNIQUE │
└──────────────────────────┘
```

Dominio relacional con invariantes explícitas y garantías en el motor. Cada entidad tiene una frontera
bien definida: `projects` como raíz de agregación, `tasks` como contenido de usuario protegido, y `labels`
como taxonomía de configuración del tablero asociada mediante una tabla puente `task_labels` con claves
foráneas compuestas.

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

### Posición de ordenación manual y restricción única

```sql
ALTER TABLE tasks ADD COLUMN position double precision NOT NULL;
ALTER TABLE tasks ADD CONSTRAINT tasks_position_unica UNIQUE (column_id, position);
```

El orden manual dentro de una columna utiliza una posición fraccionaria (`double precision`). Al mover una tarjeta entre dos existentes con posiciones $a$ y $b$, el servidor calcula el punto medio $(a + b) / 2.0$ en $O(1)$ sin renumerar las demás tarjetas.

La restricción `tasks_position_unica` sobre `(column_id, position)` es fundamental:
- **Protege contra el límite de precisión de IEEE 754**: a las 52 divisiones consecutivas en el mismo hueco, el cálculo colapsa numéricamente contra el extremo. La restricción convierte ese fallo silencioso en un error detectable `SQLSTATE 23505 (unique_violation)`.
- **Resuelve la concurrencia**: dos inserciones simultáneas que calculen el mismo punto medio chocan contra la restricción. La aplicación captura el 23505, revierte al savepoint, rebalancea la columna con `ROW_NUMBER() * 1024.0` y reintenta.

### `position` por trigger en inserción, no por aplicación

```sql
CREATE FUNCTION set_task_position() RETURNS trigger AS $$
BEGIN
  IF NEW.position IS NULL THEN
    SELECT COALESCE(MAX(position), 0) + 1024.0 INTO NEW.position
      FROM tasks
     WHERE column_id = NEW.column_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_set_position
  BEFORE INSERT ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_task_position();
```

Si la asignación de posición viviera solo en el servicio, cualquier inserción desde el seed o desde `psql` fallaría al violar el `NOT NULL`. El trigger asigna automáticamente `MAX(position) + 1024.0` al final de la columna cuando la fila no trae posición explícita.

### Fecha de vencimiento como `date` puro (sin hora)

```sql
ALTER TABLE tasks ADD COLUMN due_date date;
ALTER TYPE column_sort ADD VALUE IF NOT EXISTS 'due_asc';
```

La fecha de vencimiento (`tasks.due_date`, migración `0008_tasks_due_date.sql`) utiliza el tipo `date` y no `timestamptz`. Esta elección se fundamenta en mediciones empíricas de desfase horario entre entornos:
- Los contenedores Docker de la base de datos y de la API operan en **UTC**.
- El equipo de desarrollo y los usuarios operan en husos locales como **America/Bogota (GMT-05:00)**.

Entre las 19:00 y las 23:59 locales de Bogotá (5 horas al día), el contenedor se encuentra en la fecha del día siguiente. Si se utilizara `timestamptz`, una fecha «vence el 12 de marzo» almacenada como medianoche UTC (`2026-03-12T00:00:00Z`) se proyectaría en Bogotá como **el 11 de marzo a las 19:00**, haciendo que la tarjeta cambie de fecha según el huso horario de quien la observe. Con `due_date date NULL` no existe componente horario ni conversión de zona: la cadena `YYYY-MM-DD` es universal e idéntica para todos los usuarios.

### Etiquetas normalizadas y claves foráneas compuestas (SL-18)

Las etiquetas de tareas se modelan de forma relacional normalizada mediante las tablas `labels` y `task_labels` (migraciones `0009_etiquetas.sql` y `0010_etiquetas_cascada_al_borrar_proyecto.sql`). Se descartó la alternativa de almacenar un array `text[]` con índice GIN en `tasks` tras medir empíricamente ambos enfoques:
- **Integridad categórica**: un array acepta cadenas arbitrarias o etiquetas eliminadas (`UPDATE 1`); la tabla puente con clave foránea devuelve `SQLSTATE 23503` en el motor ante cualquier identificador inexistente.
- **Coste de renombrado**: actualizar el nombre de una etiqueta en `labels` es una única operación $O(1)$ de 0,346 ms independientemente del volumen de uso, mientras que en un array requiere escanear y actualizar todas las tareas etiquetadas (1,540 ms, 4,5 veces más lento y con coste lineal creciente).

#### Claves compuestas contra asignaciones multidominio
En un diseño con claves foráneas simples `FOREIGN KEY (task_id) REFERENCES tasks(id)` y `FOREIGN KEY (label_id) REFERENCES labels(id)`, una tarea del proyecto A aceptaría silenciosamente etiquetas del proyecto B. Para impedirlo en el motor:
1. `tasks` declara `CONSTRAINT tasks_id_project_id_key UNIQUE (id, project_id)`.
2. `labels` declara `CONSTRAINT labels_id_project_id_key UNIQUE (id, project_id)`.
3. `task_labels` declara claves foráneas compuestas:
   ```sql
   CONSTRAINT task_labels_task_fkey
     FOREIGN KEY (task_id, project_id)
     REFERENCES tasks (id, project_id) ON DELETE CASCADE,
   CONSTRAINT task_labels_label_fkey
     FOREIGN KEY (label_id, project_id)
     REFERENCES labels (id, project_id) ON DELETE CASCADE
   ```
Si se intenta asociar una etiqueta con el `project_id` de otra tarea, PostgreSQL rechaza la operación con `ERROR 23503: Key (label_id, project_id) is not present in table labels`.

### Por qué la foránea de labels hacia projects es CASCADE y no RESTRICT (ADR-030)

La migración `0009` declaró inicialmente `labels.project_id ... ON DELETE RESTRICT`, copiando por inercia la regla de `tasks`. Al ejecutar la prueba E2E de etiquetas, borrar un proyecto con etiquetas creadas y cero tareas devolvió `HTTP 500 INTERNAL_ERROR`, ya que el traductor de errores solo esperaba el `23503` de `tasks`.

Traducir ese código habría sido tapar el síntoma. El repositorio ya distinguía formalmente dos naturalezas:
1. **Contenido del usuario (`tasks`)**: `ON DELETE RESTRICT`. El borrado se rechaza con `409 PROJECT_HAS_TASKS` para proteger el trabajo y ofrecer salida explícita.
2. **Configuración del tablero (`project_columns` y `labels`)**: `ON DELETE CASCADE`. Las columnas y etiquetas no tienen significado ni existencia fuera del proyecto.

La migración `0010` ajusta la clave foránea a `ON DELETE CASCADE`. Un proyecto con etiquetas y sin tareas se elimina limpiamente con 204 sin dejar filas huérfanas; y si contiene tareas, la protección `RESTRICT` de `tasks` se dispara en primer lugar devolviendo 409 con las tareas intactas.

### Paleta cerrada de 12 colores semánticos y unicidad de nombres

- **Paleta cerrada de 12 tokens**: `CONSTRAINT labels_color_check CHECK (color IN ('slate', 'red', 'orange', 'amber', 'yellow', 'green', 'teal', 'cyan', 'blue', 'indigo', 'purple', 'pink'))`. La integridad de la paleta la garantiza PostgreSQL: la API, el seed y `psql` están sujetos a la misma restricción.
- **Unicidad insensible a mayúsculas**: `CREATE UNIQUE INDEX labels_project_name_unique_ci ON labels (project_id, lower(btrim(name)))`. Genera colisión real (`409 LABEL_NAME_TAKEN`) capturando `SQLSTATE 23505` sin recurrir a consultas previas en memoria.

### Índices

```sql
CREATE INDEX tasks_project_id_idx       ON tasks (project_id);
CREATE INDEX tasks_project_status_idx   ON tasks (project_id, status);
CREATE INDEX labels_project_id_idx      ON labels (project_id);
CREATE INDEX task_labels_label_id_idx   ON task_labels (label_id);
CREATE INDEX task_labels_project_id_idx ON task_labels (project_id);
```

`tasks_project_id_idx` no es opcional: PostgreSQL **no** indexa automáticamente el lado hijo de una clave foránea, y sin él cada verificación de `ON DELETE RESTRICT` hace un recorrido secuencial. `tasks_project_status_idx` sirve a la consulta que domina la aplicación: las tareas de un proyecto agrupadas por estado. Asimismo, los índices de `labels` y `task_labels` previenen escaneos secuenciales durante la cascada de borrado y la búsqueda de asignaciones.

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
  id           uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid             NOT NULL,
  column_id    uuid             NOT NULL,
  title        text             NOT NULL,
  description  text,
  status       task_status      NOT NULL DEFAULT 'TODO',
  priority     task_priority    NOT NULL DEFAULT 'MEDIUM',
  position     double precision NOT NULL,
  due_date     date,
  completed_at timestamptz,
  created_at   timestamptz      NOT NULL DEFAULT now(),
  updated_at   timestamptz      NOT NULL DEFAULT now(),

  CONSTRAINT tasks_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE RESTRICT,

  CONSTRAINT tasks_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT tasks_title_max_len   CHECK (char_length(title) <= 200),
  CONSTRAINT tasks_done_completed_at CHECK (
    (status = 'DONE'  AND completed_at IS NOT NULL) OR
    (status <> 'DONE' AND completed_at IS NULL)
  ),
  CONSTRAINT tasks_position_unica UNIQUE (column_id, position)
);

CREATE INDEX tasks_project_id_idx     ON tasks (project_id);
CREATE INDEX tasks_project_status_idx ON tasks (project_id, status);

CREATE FUNCTION set_task_position() RETURNS trigger AS $$
BEGIN
  IF NEW.position IS NULL THEN
    SELECT COALESCE(MAX(position), 0) + 1024.0 INTO NEW.position
      FROM tasks
     WHERE column_id = NEW.column_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_set_position
  BEFORE INSERT ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_task_position();

CREATE TRIGGER tasks_set_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- migrations/0009_etiquetas.sql y 0010_etiquetas_cascada_al_borrar_proyecto.sql

CREATE TABLE labels (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid        NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  name       text        NOT NULL,
  color      text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT labels_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT labels_name_max_len   CHECK (char_length(name) <= 50),
  CONSTRAINT labels_color_check CHECK (
    color IN (
      'slate', 'red', 'orange', 'amber',
      'yellow', 'green', 'teal', 'cyan',
      'blue', 'indigo', 'purple', 'pink'
    )
  ),
  CONSTRAINT labels_id_project_id_key UNIQUE (id, project_id)
);

CREATE UNIQUE INDEX labels_project_name_unique_ci
  ON labels (project_id, lower(btrim(name)));

CREATE INDEX labels_project_id_idx ON labels (project_id);

CREATE TRIGGER labels_set_updated_at
  BEFORE UPDATE ON labels
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE tasks
  ADD CONSTRAINT tasks_id_project_id_key UNIQUE (id, project_id);

CREATE TABLE task_labels (
  task_id    uuid NOT NULL,
  label_id   uuid NOT NULL,
  project_id uuid NOT NULL,
  PRIMARY KEY (task_id, label_id),

  CONSTRAINT task_labels_task_fkey
    FOREIGN KEY (task_id, project_id)
    REFERENCES tasks (id, project_id) ON DELETE CASCADE,

  CONSTRAINT task_labels_label_fkey
    FOREIGN KEY (label_id, project_id)
    REFERENCES labels (id, project_id) ON DELETE CASCADE
);

CREATE INDEX task_labels_label_id_idx ON task_labels (label_id);
CREATE INDEX task_labels_project_id_idx ON task_labels (project_id);
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
| Fecha de vencimiento | **Incorporada en SL-17** (migración `0008_tasks_due_date.sql`, ADR-028). Se implementó completa de punta a punta: columna `due_date date` en PostgreSQL, parser de identidad para OID 1082 en `pg`, soporte en contrato y esquemas Zod, criterio de ordenación `due_asc` y semáforo reactivo en cliente. |
| Soft delete | Se haría con `deleted_at` y vistas filtradas si existiera requisito de auditoría o retención regulatoria. No existe aquí, y contamina todas las consultas. |
| Particionado / paginación | Innecesario a este volumen. El umbral práctico está en el orden de decenas de miles de tareas por proyecto; a partir de ahí, paginación por cursor sobre `(created_at, id)`. |
| Concurrencia en edición | Hoy gana la última escritura. Con edición concurrente real se añadiría una columna `version` y respuesta `412 Precondition Failed`. Se menciona porque conocer el límite del diseño es parte del criterio. |

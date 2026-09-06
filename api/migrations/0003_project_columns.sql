-- Columnas configurables por proyecto.
--
-- Hasta ahora las columnas del tablero **eran** el `ENUM task_status`: tres,
-- fijas y globales. De ese enum cuelgan cuatro garantías que no se pueden
-- perder —el `CHECK` de `completed_at`, el trigger que lo sella, el
-- `enum_range` con el que `/stats` asegura que un estado sin tareas salga con
-- 0, y el límite de trabajo en curso—, así que el enum **no desaparece**:
-- pasa a ser la **categoría de ciclo de vida** de cada columna.
--
-- Es el modelo de Jira: estados personalizados ilimitados, cada uno declarando
-- una de exactamente tres categorías. Atlassian se niega por diseño a permitir
-- más, y por la misma razón: la categoría es lo que hace posible informar
-- entre proyectos cuando cada uno tiene columnas distintas.
--
-- Se descartó eliminar el enum y sustituirlo por un booleano `is_terminal`.
-- Medido sobre este repositorio: eliminarlo obliga a tocar 16 archivos frente
-- a 9, exige reescribir el `CHECK`, el trigger y el contrato de `/stats`, y su
-- migración de retirada no es lógicamente reversible —no hay traducción
-- honesta de N columnas a tres estados—.

-- Up Migration

CREATE TABLE project_columns (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid        NOT NULL,
  name       text        NOT NULL,
  -- La categoría es el puente con todo lo que ya existe. Varias columnas
  -- pueden compartirla: «En revisión» y «QA» son ambas IN_PROGRESS, y
  -- «Entregado» y «Cancelado» serían ambas DONE.
  category   task_status NOT NULL,
  position   integer     NOT NULL,
  -- El límite de trabajo en curso baja del proyecto a la columna, que es
  -- donde el método kanban lo sitúa: «Desarrollo» máximo 3 y «QA» máximo 2 es
  -- una política real que un único límite por proyecto no puede expresar.
  wip_limit  integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT project_columns_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,

  CONSTRAINT project_columns_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT project_columns_name_max_len   CHECK (char_length(name) <= 60),
  CONSTRAINT project_columns_position_positive CHECK (position > 0),
  CONSTRAINT project_columns_wip_positive
    CHECK (wip_limit IS NULL OR wip_limit > 0),

  -- Una columna terminal no admite límite: limitar lo ya terminado no
  -- significa nada, y aceptarlo invitaría a bloquear la salida del flujo.
  CONSTRAINT project_columns_done_has_no_wip
    CHECK (category <> 'DONE' OR wip_limit IS NULL),

  -- **La clave del diseño.** Permite que `tasks` referencie el par
  -- (columna, categoría) y que el motor garantice que no se separan. Sin
  -- esto, `tasks.status` podría contradecir a la columna que la contiene.
  CONSTRAINT project_columns_id_category_key UNIQUE (id, category),

  -- Junto con la FK compuesta de `tasks`, impide que una tarea acabe en una
  -- columna de otro proyecto.
  CONSTRAINT project_columns_project_id_id_key UNIQUE (project_id, id)
);

-- Dos columnas del mismo proyecto no pueden llamarse igual ignorando
-- mayúsculas y espacios, por el mismo motivo que los proyectos: da un camino
-- real de conflicto (409) en vez de dos columnas indistinguibles.
CREATE UNIQUE INDEX project_columns_project_name_unique_ci
  ON project_columns (project_id, lower(btrim(name)));

-- El reordenamiento intercambia posiciones, y hacerlo en dos `UPDATE` dentro
-- de una transacción violaría un índice inmediato a mitad de camino. Con
-- `DEFERRABLE` la unicidad se comprueba al confirmar, no en cada sentencia.
CREATE UNIQUE INDEX project_columns_project_position_unique
  ON project_columns (project_id, position);
ALTER TABLE project_columns
  ADD CONSTRAINT project_columns_project_position_key
  UNIQUE USING INDEX project_columns_project_position_unique
  DEFERRABLE INITIALLY IMMEDIATE;

CREATE TRIGGER project_columns_set_updated_at
  BEFORE UPDATE ON project_columns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------- columnas de los proyectos
-- Todo proyecto existente recibe las tres columnas que ya tenía de facto, con
-- los mismos nombres que mostraba la interfaz. Sin esto, un proyecto ya creado
-- quedaría con un tablero sin columnas.

INSERT INTO project_columns (project_id, name, category, position, wip_limit)
SELECT p.id, c.name, c.category, c.position,
       -- El límite que vivía en el proyecto se traslada a «En curso», que es
       -- la única columna a la que se aplicaba.
       CASE WHEN c.category = 'IN_PROGRESS' THEN p.wip_limit ELSE NULL END
FROM projects p
CROSS JOIN (VALUES
  ('Por hacer',  'TODO'::task_status,        1),
  ('En curso',   'IN_PROGRESS'::task_status, 2),
  ('Completada', 'DONE'::task_status,        3)
) AS c(name, category, position);

-- Down Migration

DROP TABLE IF EXISTS project_columns;

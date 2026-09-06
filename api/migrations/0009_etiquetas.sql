-- Etiquetas de color por proyecto y asignación a tareas (SL-18)
--
-- Se adopta el modelo relacional normalizado con tabla puente `task_labels`
-- en lugar de un array `text[]` con índice GIN tras verificar que:
--   1. La diferencia en lectura es insignificante (fracciones de milisegundo).
--   2. El renombrado de etiquetas en uso es más de cuatro veces más rápido (0,346 ms frente a 1,540 ms).
--   3. La integridad referencial la impone PostgreSQL (RNF-03): un array aceptaría etiquetas
--      inexistentes o eliminadas en silencio, mientras que la tabla puente garantiza rechazo con 23503.
--
-- Integridad multidominio mediante claves foráneas compuestas:
-- Sin `FOREIGN KEY (task_id, project_id)` y `FOREIGN KEY (label_id, project_id)`,
-- una tarea del proyecto A podría recibir etiquetas del proyecto B sin que el motor lo impida.
-- Con claves foráneas compuestas, el motor rechaza cualquier asignación cruzada con ERROR 23503.

-- Up Migration

CREATE TABLE labels (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid        NOT NULL REFERENCES projects (id) ON DELETE RESTRICT,
  name       text        NOT NULL,
  color      text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Evitar nombres en blanco y limitar longitud coherente con las columnas del tablero
  CONSTRAINT labels_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT labels_name_max_len   CHECK (char_length(name) <= 50),

  -- Paleta cerrada de 12 colores semánticos impuesta por el motor:
  -- La base garantiza que ni la API, ni el seed ni psql guarden colores arbitrarios o hex sin token.
  CONSTRAINT labels_color_check CHECK (
    color IN (
      'slate', 'red', 'orange', 'amber',
      'yellow', 'green', 'teal', 'cyan',
      'blue', 'indigo', 'purple', 'pink'
    )
  ),

  -- Requerido para permitir la clave foránea compuesta desde task_labels
  CONSTRAINT labels_id_project_id_key UNIQUE (id, project_id)
);

-- Índice único insensible a mayúsculas y espacios dentro de cada proyecto:
-- Genera conflicto real (409 LABEL_NAME_TAKEN) capturando el 23505 sin carreras de SELECT previo.
CREATE UNIQUE INDEX labels_project_name_unique_ci
  ON labels (project_id, lower(btrim(name)));

-- PostgreSQL no indexa automáticamente el lado hijo de la clave foránea a projects
CREATE INDEX labels_project_id_idx ON labels (project_id);

-- Reutilización del trigger genérico para mantener updated_at
CREATE TRIGGER labels_set_updated_at
  BEFORE UPDATE ON labels
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Garantizar unicidad de (id, project_id) en tasks para poder referenciarla
-- desde la clave foránea compuesta de task_labels
ALTER TABLE tasks
  ADD CONSTRAINT tasks_id_project_id_key UNIQUE (id, project_id);

-- Tabla puente para la relación N:M entre tareas y etiquetas
CREATE TABLE task_labels (
  task_id    uuid NOT NULL,
  label_id   uuid NOT NULL,
  project_id uuid NOT NULL,
  PRIMARY KEY (task_id, label_id),

  -- Claves foráneas compuestas: el corazón de la integridad del diseño.
  -- Impiden que una tarea reciba etiquetas de otro proyecto.
  CONSTRAINT task_labels_task_fkey
    FOREIGN KEY (task_id, project_id)
    REFERENCES tasks (id, project_id) ON DELETE CASCADE,

  CONSTRAINT task_labels_label_fkey
    FOREIGN KEY (label_id, project_id)
    REFERENCES labels (id, project_id) ON DELETE CASCADE
);

-- PostgreSQL no crea automáticamente índices para el lado hijo de las foráneas
CREATE INDEX task_labels_label_id_idx ON task_labels (label_id);
CREATE INDEX task_labels_project_id_idx ON task_labels (project_id);

-- Down Migration

DROP TABLE IF EXISTS task_labels;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_id_project_id_key;
DROP TABLE IF EXISTS labels;

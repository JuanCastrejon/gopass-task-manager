-- Esquema inicial: proyectos y tareas.
--
-- Una sola migración porque el esquema inicial es atómico: partirlo en
-- cuatro archivos solo introduce un orden accidental sin ganar nada.
--
-- Escrita en SQL puro y no con el DSL de node-pg-migrate a propósito. La
-- prueba exige PostgreSQL, y los tipos ENUM, el índice funcional y los
-- triggers se leen mejor en SQL que envueltos en llamadas `pgm.sql(...)`.
--
-- No se declara `CREATE EXTENSION pgcrypto`: `gen_random_uuid()` vive en
-- `pg_catalog` desde PostgreSQL 13 y esta base corre la 16.

-- Up Migration

CREATE TYPE task_status   AS ENUM ('TODO', 'IN_PROGRESS', 'DONE');
CREATE TYPE task_priority AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- El orden de declaración de un ENUM es su orden de comparación, así que
-- `ORDER BY priority DESC` devuelve HIGH primero sin necesidad de un CASE.

CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------- projects

CREATE TABLE projects (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT projects_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT projects_name_max_len   CHECK (char_length(name) <= 120)
);

-- Índice funcional: impide "Telepeaje" y "telepeaje " a la vez. Da un
-- camino real de conflicto (409 PROJECT_NAME_TAKEN) que se resuelve
-- capturando el 23505, no consultando antes de insertar.
CREATE UNIQUE INDEX projects_name_unique_ci ON projects (lower(btrim(name)));

CREATE TRIGGER projects_set_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------- tasks

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

  -- La FK se nombra explícitamente porque el código de traducción de
  -- errores depende de este nombre. Dejarlo al nombre autogenerado sería
  -- depender de un detalle implícito del motor.
  CONSTRAINT tasks_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE RESTRICT,

  CONSTRAINT tasks_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT tasks_title_max_len   CHECK (char_length(title) <= 200),

  -- Única regla de máquina de estados del dominio, impuesta por el motor:
  -- ninguna vía de escritura puede dejar una tarea marcada como completada
  -- sin fecha de completado, ni al revés.
  CONSTRAINT tasks_done_completed_at CHECK (
    (status =  'DONE' AND completed_at IS NOT NULL) OR
    (status <> 'DONE' AND completed_at IS NULL)
  )
);

-- PostgreSQL no indexa automáticamente el lado hijo de una clave foránea.
-- Sin este índice, cada verificación de ON DELETE RESTRICT recorre la tabla.
CREATE INDEX tasks_project_id_idx     ON tasks (project_id);

-- Sirve a la consulta que domina la aplicación: las tareas de un proyecto
-- agrupadas por estado.
CREATE INDEX tasks_project_status_idx ON tasks (project_id, status);

CREATE TRIGGER tasks_set_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- El CHECK de arriba VERIFICA la invariante; este trigger la SATISFACE.
-- Sellar `completed_at` desde el servicio dejaría fuera al seed, a `psql` y
-- a cualquier migración de datos: esas escrituras violarían el CHECK y
-- producirían un 500 en vez de un dato correcto.
CREATE FUNCTION set_task_completed_at() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'DONE' THEN
    -- Solo se sella en la transición: reeditar una tarea ya completada no
    -- debe mover su fecha de completado.
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

-- Down Migration

DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS projects;
DROP FUNCTION IF EXISTS set_task_completed_at();
DROP FUNCTION IF EXISTS set_updated_at();
DROP TYPE IF EXISTS task_priority;
DROP TYPE IF EXISTS task_status;

-- Cada tarea pasa a vivir en una columna concreta, no en un estado global.
--
-- `tasks.status` **se conserva**, y no por comodidad: es la categoría de ciclo
-- de vida, y de ella dependen el `CHECK` de `completed_at`, el trigger que lo
-- sella y el `enum_range` de `/stats`. Lo que hace esta migración es atarla al
-- par (columna, categoría) mediante una clave foránea compuesta, de modo que
-- el motor impida que se separen.
--
-- Sin esa clave compuesta, `status` y `column_id` serían dos fuentes de verdad
-- que acabarían divergiendo: una tarea marcada `DONE` colgando de la columna
-- «En curso», con `completed_at` sellado y visible en la columna equivocada.

-- Up Migration

ALTER TABLE tasks ADD COLUMN column_id uuid;

-- Cada tarea existente se coloca en la columna de su proyecto cuya categoría
-- coincide con el estado que ya tenía. La correspondencia es exacta porque la
-- migración anterior creó las tres categorías para todos los proyectos.
UPDATE tasks t
   SET column_id = pc.id
  FROM project_columns pc
 WHERE pc.project_id = t.project_id
   AND pc.category   = t.status;

-- Si algo quedara sin asignar, la migración debe fallar aquí y no dejar el
-- esquema a medias con un NOT NULL imposible de cumplir.
DO $$
DECLARE huerfanas integer;
BEGIN
  SELECT count(*) INTO huerfanas FROM tasks WHERE column_id IS NULL;
  IF huerfanas > 0 THEN
    RAISE EXCEPTION 'Quedaron % tareas sin columna asignada; se aborta la migracion', huerfanas;
  END IF;
END $$;

ALTER TABLE tasks ALTER COLUMN column_id SET NOT NULL;

-- La columna pertenece al mismo proyecto que la tarea.
ALTER TABLE tasks
  ADD CONSTRAINT tasks_project_column_fkey
  FOREIGN KEY (project_id, column_id)
  REFERENCES project_columns (project_id, id) ON DELETE RESTRICT;

-- Y el estado de la tarea es exactamente la categoría de esa columna.
-- `ON DELETE RESTRICT` es lo que produce el 409 al borrar una columna con
-- tareas, igual que el precedente de borrar un proyecto con tareas (ADR-003).
ALTER TABLE tasks
  ADD CONSTRAINT tasks_column_category_fkey
  FOREIGN KEY (column_id, status)
  REFERENCES project_columns (id, category) ON DELETE RESTRICT;

-- El conteo por columna se consulta en cada intento de mover una tarea, para
-- imponer el límite de trabajo en curso.
CREATE INDEX tasks_column_id_idx ON tasks (column_id);

-- ------------------------------------------------------------------ trigger
-- Una tarea insertada sin columna se coloca en la primera de su categoría.
--
-- Mismo criterio que el trigger de `completed_at`, y por el mismo motivo:
-- derivar la columna solo desde el servicio dejaría fuera al seed, a `psql` y
-- a cualquier otro cliente, y un `NOT NULL` sin valor por defecto convertiría
-- cada `INSERT` directo en un error. Con esto, `INSERT INTO tasks
-- (project_id, title, status)` sigue funcionando exactamente igual que antes
-- de que existieran las columnas.
--
-- No suple a la aplicación: cuando el cliente indica columna, se respeta. Solo
-- rellena el hueco cuando nadie la ha dicho.

CREATE FUNCTION set_task_column_from_status() RETURNS trigger AS $$
BEGIN
  IF NEW.column_id IS NULL THEN
    SELECT id INTO NEW.column_id
      FROM project_columns
     WHERE project_id = NEW.project_id
       AND category   = NEW.status
     ORDER BY position
     LIMIT 1;

    IF NEW.column_id IS NULL THEN
      RAISE EXCEPTION 'El proyecto % no tiene ninguna columna de categoria %',
        NEW.project_id, NEW.status
        USING ERRCODE = '23502';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- `BEFORE INSERT OR UPDATE OF project_id`: al reasignar una tarea a otro
-- proyecto, su columna anterior pertenece al proyecto de origen y la clave
-- foránea compuesta la rechazaría. Poniendo `column_id` a NULL en el UPDATE,
-- el trigger la recoloca en la columna equivalente del proyecto destino.
CREATE TRIGGER tasks_set_column_from_status
  BEFORE INSERT OR UPDATE OF project_id, column_id ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_task_column_from_status();

-- El índice de (project_id, status) que creó la migración 0002 sigue sirviendo
-- a `/stats` y a los filtros por estado, así que se conserva.

-- Down Migration

DROP TRIGGER IF EXISTS tasks_set_column_from_status ON tasks;
DROP FUNCTION IF EXISTS set_task_column_from_status();
DROP INDEX IF EXISTS tasks_column_id_idx;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_column_category_fkey;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_project_column_fkey;
ALTER TABLE tasks DROP COLUMN IF EXISTS column_id;

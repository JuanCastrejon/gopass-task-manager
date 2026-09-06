-- Orden manual de tareas dentro de una columna.
--
-- Se adopta una posición fraccionaria (`double precision`) combinada con la
-- restricción única `tasks_position_unica (column_id, position)` y rebalanceo
-- bajo colisión (23505) o desbordamiento por división (22003).
--
-- Al arrastrar una tarjeta entre dos existentes, el servidor calcula el punto
-- medio `(anterior + siguiente) / 2` en O(1), sin necesidad de renumerar el
-- resto de tarjetas de la columna. Si tras 52 inserciones consecutivas en el
-- mismo hueco la precisión colapsa, la restricción única rechaza el duplicado
-- y la aplicación rebalancea de inmediato con posiciones espaciadas a 1024.0.
--
-- Un trigger en `tasks` asigna `MAX(position) + 1024.0` en el `INSERT` cuando
-- no se proporcione posición, asegurando que el seed y `psql` sigan
-- funcionando sin depender exclusivamente de la lógica del servicio.

-- Up Migration

-- IF NOT EXISTS permite reaplicar la migración tras un `migrate:down`, dado
-- que PostgreSQL no permite eliminar valores de un tipo ENUM en el down.
ALTER TYPE column_sort ADD VALUE IF NOT EXISTS 'manual';

ALTER TABLE tasks ADD COLUMN position double precision;

-- Backfill obligatorio: reproduce exactamente el orden actual
-- (created_at DESC, id) para que ninguna tarjeta cambie de lugar.
UPDATE tasks t SET position = sub.pos FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY column_id ORDER BY created_at DESC, id) * 1024.0 AS pos
  FROM tasks
) sub WHERE t.id = sub.id;

ALTER TABLE tasks ALTER COLUMN position SET NOT NULL;

-- Restricción única nombrada explícitamente para el traductor de errores.
ALTER TABLE tasks
  ADD CONSTRAINT tasks_position_unica UNIQUE (column_id, position);

-- Asignación automática de posición al insertar si no viene informada.
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

-- PostgreSQL dispara los triggers del mismo evento (BEFORE INSERT) en orden
-- alfabético de nombre. `tasks_set_column_from_status` se ejecuta antes que
-- `tasks_set_position` por orden alfabético ('c' < 'p'), lo que garantiza que
-- `NEW.column_id` ya esté resuelto a partir de `NEW.status` antes de que
-- `set_task_position` consulte `MAX(position)` filtrando por `NEW.column_id`.
CREATE TRIGGER tasks_set_position
  BEFORE INSERT ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_task_position();

COMMENT ON COLUMN tasks.position IS
  'Posicion de ordenacion manual dentro de la columna. Fraccionaria (double precision) para permitir insertar entre dos tarjetas calculando el punto medio sin desplazar las demas; las colisiones por limite de precision se controlan con la restriccion tasks_position_unica y rebalanceo en la aplicacion.';

-- Down Migration

DROP TRIGGER IF EXISTS tasks_set_position ON tasks;
DROP FUNCTION IF EXISTS set_task_position();
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_position_unica;
ALTER TABLE tasks DROP COLUMN IF EXISTS position;

-- PostgreSQL no admite `ALTER TYPE ... DROP VALUE` para eliminar un valor de un ENUM.
-- El valor 'manual' permanece en el tipo column_sort para evitar recrear el tipo y
-- todas las tablas o columnas dependientes.

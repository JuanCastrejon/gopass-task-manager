-- Límite de trabajo en curso (WIP) por proyecto.
--
-- Es la idea central del método kanban: un tablero sin límite no gestiona
-- flujo, solo dibuja columnas. El límite hace visible el cuello de botella al
-- impedir empezar más trabajo del que el equipo puede terminar.
--
-- **Se aplica solo a `IN_PROGRESS`, y es deliberado.** En un tablero de tres
-- columnas, «trabajo en curso» es literalmente esa columna: `TODO` es la cola
-- de entrada y `DONE` el archivo, y limitarlos no significaría nada. Un límite
-- por columna arbitraria sería vocabulario kanban sin su semántica.
--
-- `NULL` significa «sin límite», no cero. Un proyecto recién creado no debe
-- nacer bloqueado, y `0` es un límite legítimo de expresar pero absurdo de
-- imponer por defecto; el CHECK lo rechaza para que nadie deje un tablero en
-- el que no se puede trabajar.

-- Up Migration

ALTER TABLE projects
  ADD COLUMN wip_limit integer;

ALTER TABLE projects
  ADD CONSTRAINT projects_wip_limit_positive
    CHECK (wip_limit IS NULL OR wip_limit > 0);

COMMENT ON COLUMN projects.wip_limit IS
  'Maximo de tareas simultaneas en IN_PROGRESS. NULL = sin limite.';

-- El conteo de tareas en curso de un proyecto se consulta en cada intento de
-- mover una tarea a `IN_PROGRESS`, dentro de la transaccion que valida el
-- limite. Sin este indice ese conteo es un escaneo secuencial de `tasks`.
CREATE INDEX tasks_project_id_status_idx ON tasks (project_id, status);

-- Down Migration

DROP INDEX IF EXISTS tasks_project_id_status_idx;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_wip_limit_positive;
ALTER TABLE projects DROP COLUMN IF EXISTS wip_limit;

-- Las etiquetas se van con el proyecto, como las columnas.
--
-- La `0009` declaró `labels.project_id ... ON DELETE RESTRICT`, copiando lo que
-- hace `tasks`. Es incorrecto, y se descubrió con la prueba E2E de etiquetas:
-- borrar un proyecto que tenía una etiqueta y **ninguna tarea** devolvía
-- `HTTP 500 INTERNAL_ERROR`, no un 409 con explicación.
--
-- El 500 salía porque el traductor de errores solo reconoce el `23503` de
-- `tasks_project_id_fkey`. La foránea de `labels` abrió un tercer camino que
-- nadie traducía. Pero traducirlo habría sido tapar el síntoma: el problema es
-- que la regla estaba mal elegida.
--
-- El repositorio ya distingue las dos naturalezas, y las etiquetas están del
-- lado de la configuración:
--
--   tasks            -> ON DELETE RESTRICT   contenido del usuario; el 409 lo
--                                            protege y ofrece salida
--   project_columns  -> ON DELETE CASCADE    configuración del tablero; no
--                                            significa nada fuera del proyecto
--
-- Una etiqueta es exactamente lo segundo: no existe fuera de su proyecto, su
-- clave foránea compuesta lo impone, y conservarla tras borrar el proyecto
-- dejaría filas huérfanas que nadie podría ver ni usar. Borrar un proyecto
-- sigue estando protegido por sus tareas, que es lo que de verdad hay que no
-- perder por accidente.
--
-- `task_labels` no necesita cambio: ya cascadea desde `tasks` y desde `labels`.

-- Up Migration

ALTER TABLE labels DROP CONSTRAINT labels_project_id_fkey;

ALTER TABLE labels
  ADD CONSTRAINT labels_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE;

-- Down Migration

ALTER TABLE labels DROP CONSTRAINT labels_project_id_fkey;

ALTER TABLE labels
  ADD CONSTRAINT labels_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE RESTRICT;

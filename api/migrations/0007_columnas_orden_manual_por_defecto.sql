-- El valor por defecto de `project_columns.sort` pasa a `manual`.
--
-- Una columna recién creada con el valor previo (`priority_desc`) bloqueaba
-- el arrastre manual de tarjetas desde el primer momento. Al pasar el valor por
-- defecto a `manual`, cualquier columna recién creada permite reordenar tarjetas
-- de inmediato.
--
-- `SET DEFAULT` no toca las filas existentes, por lo que las columnas ya creadas
-- conservan su orden configurado sin alteración.
--
-- Esta sentencia debe residir en una migración independiente de la 0006:
-- usar un nuevo valor de ENUM en la misma transacción en que se añadió
-- (mediante ALTER TYPE ... ADD VALUE) produce:
--   SQLSTATE 55P04: unsafe use of new value "manual" of enum type column_sort
-- Por defecto, node-pg-migrate agrupa todas las migraciones pendientes en una
-- única transacción. Gracias al flag `--no-single-transaction` (configurado en
-- `docker-entrypoint.sh` y en los scripts `migrate` de `package.json`), cada archivo
-- corre en su propia transacción, permitiendo que el motor confirme la adición del
-- valor al ENUM en la 0006 antes de que la 0007 lo use en SET DEFAULT.

-- Up Migration

ALTER TABLE project_columns ALTER COLUMN sort SET DEFAULT 'manual';

-- Down Migration

ALTER TABLE project_columns ALTER COLUMN sort SET DEFAULT 'priority_desc';

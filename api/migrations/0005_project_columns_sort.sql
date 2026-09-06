-- Orden de las tareas, configurable por columna.
--
-- Cada etapa se lee con una pregunta distinta: en «Por hacer» interesa qué
-- tomar a continuación —prioridad alta primero—; en «En curso», qué lleva más
-- tiempo atascado —las más antiguas—; en «Completada», lo recién terminado.
-- Un único criterio para todo el tablero obliga a un compromiso en las tres.
--
-- **Vive en la columna y no en el navegador de cada persona.** Se descartó
-- guardarlo en `localStorage`: no se comparte por enlace, no sobrevive a
-- cambiar de equipo y contradice ADR-019, que fijó que el estado del tablero
-- vive en un sitio compartible. Las columnas ya son configuración del equipo;
-- su orden también lo es.
--
-- Se verificó contra PostgreSQL que una sola consulta sirve un orden distinto
-- por columna mediante una escalera de `CASE`: cada rama devuelve NULL salvo
-- para el criterio activo, así que solo uno tiene efecto. No hacen falta N
-- consultas ni ordenar en cliente.

-- Up Migration

CREATE TYPE column_sort AS ENUM (
  'priority_desc',  -- prioridad alta primero; es el orden histórico
  'priority_asc',   -- prioridad baja primero
  'created_desc',   -- las más recientes primero
  'created_asc'     -- las más antiguas primero: detecta trabajo estancado
);

ALTER TABLE project_columns
  ADD COLUMN sort column_sort NOT NULL DEFAULT 'priority_desc';

COMMENT ON COLUMN project_columns.sort IS
  'Criterio de ordenacion de las tareas dentro de la columna. Compartido por el equipo.';

-- No se ofrece orden alfabético por título: no responde a ninguna decisión de
-- trabajo y solo añadiría relleno al selector.

-- Down Migration

ALTER TABLE project_columns DROP COLUMN IF EXISTS sort;
DROP TYPE IF EXISTS column_sort;

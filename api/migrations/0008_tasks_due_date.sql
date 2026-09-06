-- Fecha de vencimiento de las tareas (SL-17)
--
-- Se utiliza `date` y no `timestamptz` por decisión arquitectónica fundada en la
-- medición de desfase entre entornos:
--   - Contenedor db: UTC
--   - Contenedor api: UTC
--   - Máquina de usuario / Bogotá: America/Bogota (GMT-05:00)
--
-- Entre las 19:00 y la medianoche de Bogotá (5 horas al día), el contenedor ya
-- está en el día siguiente. Con `timestamptz`, una fecha «2026-03-12» serializada a
-- medianoche UTC (2026-03-12T00:00:00Z) se proyecta en Bogotá como 2026-03-11 19:00:00,
-- haciendo que la tarjeta cambie de fecha según el huso horario de quien la mire.
--
-- Con `due_date date NULL` no hay componente horario ni conversión de zona:
-- la cadena YYYY-MM-DD es idéntica universalmente.
--
-- No se utilizan triggers ni columnas generadas para calcular el estado de
-- vencimiento: «vencida» es una función del instante en que se consulta
-- (incompatible con la inmutabilidad exigida por GENERATED ALWAYS en PostgreSQL)
-- y ningún trigger se dispara a medianoche sin escrituras concurrentes.

-- Up Migration

ALTER TABLE tasks ADD COLUMN due_date date;

COMMENT ON COLUMN tasks.due_date IS
  'Fecha de vencimiento en formato date (sin hora). Se eligio date y no timestamptz porque existe un desfase de 5 horas entre el contenedor UTC y el usuario en America/Bogota (GMT-05:00); guardar medianoche con zona desplazaria la fecha al dia anterior entre las 19:00 y las 23:59 locales.';

-- IF NOT EXISTS permite reaplicar la migración si se ejecutó un down previo,
-- dado que PostgreSQL no permite eliminar valores de un tipo ENUM en el down.
ALTER TYPE column_sort ADD VALUE IF NOT EXISTS 'due_asc';

-- Down Migration

ALTER TABLE tasks DROP COLUMN IF EXISTS due_date;

-- PostgreSQL no admite `ALTER TYPE ... DROP VALUE` para eliminar un valor de un ENUM.
-- El valor 'due_asc' permanece en el tipo column_sort para evitar recrear el tipo y
-- todas las tablas o columnas dependientes.

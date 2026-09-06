-- Fondo de tablero por proyecto (SL-19 paso 3)
--
-- El fondo del tablero es identidad compartida del tablero, igual que las columnas
-- o el criterio de orden de las tareas: todo el equipo que entra al proyecto ve
-- el mismo fondo. Por eso vive en la base de datos como columna de `projects` y
-- no en `localStorage`. Es exactamente la decisión contraria al tema claro/oscuro
-- del paso 1 (que es preferencia personal de accesibilidad/ergonomía de cada
-- navegador), demostrando que la persistencia se decide por la semántica del dato
-- y no por costumbre técnica.
--
-- Paleta cerrada de seis valores semánticos (neutro y cinco degradados suaves):
-- La restricción CHECK se impone en el motor relacional y no únicamente en Zod,
-- garantizando que ni la API, ni el seed, ni scripts o psql puedan almacenar
-- colores libres, hexadecimales no controlados o valores fuera de diseño (RNF-03).
--
-- Se descarta la integración con Unsplash por añadir dependencia de un servicio
-- externo, clave de API y atribución obligatoria en una prueba técnica local.

-- Up Migration

ALTER TABLE projects
  ADD COLUMN background text NOT NULL DEFAULT 'neutro';

ALTER TABLE projects
  ADD CONSTRAINT projects_background_check CHECK (
    background IN ('neutro', 'azul', 'verde', 'ambar', 'purpura', 'rosa')
  );

COMMENT ON COLUMN projects.background IS
  'Fondo visual del tablero del proyecto elegido de una paleta cerrada (neutro o degradados suaves). Vive en la base de datos y no en localStorage porque es identidad compartida del tablero para todo el equipo, igual que sus columnas o el orden de las tareas, a diferencia del tema claro/oscuro que es una preferencia personal del navegador.';

-- Down Migration

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_background_check;
ALTER TABLE projects DROP COLUMN IF EXISTS background;

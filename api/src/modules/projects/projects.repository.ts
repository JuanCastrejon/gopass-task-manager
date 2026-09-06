import { pool } from '../../db/pool.js';
import { isTaskProjectFkViolation, translatePgError } from '../../db/pg-error.js';
import { ProjectHasTasksError, ProjectNotFoundError } from '../../http/errors.js';
import type { ProjectRow, ProjectSummaryRow } from './projects.mapper.js';
import type { CreateProjectInput, PatchProjectInput } from './projects.schema.js';

const PROJECT_FIELDS = 'id, name, description, created_at, updated_at';

/**
 * `COUNT(*)` devuelve `bigint`, y el driver `pg` entrega los `bigint` como
 * string para no perder precisión. El `::int` de cada agregado es lo que hace
 * que `taskCount` llegue al cliente como número y no como `"8"`.
 *
 * `COUNT(t.id)` y no `COUNT(*)`: con `LEFT JOIN`, un proyecto sin tareas
 * produce una fila con `t.*` en NULL, y `COUNT(*)` la contaría como 1.
 *
 * Los tres conteos por prioridad cuelgan del **mismo** `GROUP BY` que ya
 * calculaba `total` y `done`, y no de un agregado propio. Se midió sobre 204
 * proyectos y 20 011 tareas: añadirlos deja el plan en los mismos 275 buffers
 * compartidos y el tiempo dentro del ruido (4,0-5,5 ms el original frente a
 * 4,2-5,7 ms con ellos). Corren sobre una pasada que ya se estaba pagando.
 *
 * Se descartó replicar aquí el `jsonb_object_agg` + `enum_range` de `/stats`.
 * Allí es correcto porque agrega **una vez para toda la tabla**; por proyecto
 * degenera en un escaneo correlacionado, y la misma medición lo situó en 1175
 * buffers y 16,8-24,5 ms: 4,3 veces la lectura y entre 3 y 5 veces el tiempo.
 * Reutilizar un patrón no es reutilizar su plan de ejecución.
 *
 * `enum_range` tampoco hace falta para lo que resuelve en `/stats` —que una
 * prioridad sin tareas no desaparezca del objeto—: aquí las tres columnas
 * están nombradas una a una, así que ninguna puede faltar, y el `COALESCE`
 * convierte en 0 el NULL del proyecto sin tareas.
 */
const SUMMARY_QUERY = `
  SELECT p.id, p.name, p.description, p.created_at, p.updated_at,
         COALESCE(t.total, 0)::int         AS task_count,
         COALESCE(t.done,  0)::int         AS done_count,
         COALESCE(t.low,    0)::int        AS low_count,
         COALESCE(t.medium, 0)::int        AS medium_count,
         COALESCE(t.high,   0)::int        AS high_count,
         CASE WHEN COALESCE(t.total, 0) = 0 THEN 0
              ELSE ROUND(t.done::numeric * 100 / t.total)::int
         END AS progress
  FROM projects p
  LEFT JOIN (
    SELECT project_id,
           COUNT(t.id)                                        AS total,
           COUNT(t.id) FILTER (WHERE t.status = 'DONE')       AS done,
           COUNT(t.id) FILTER (WHERE t.priority = 'LOW')      AS low,
           COUNT(t.id) FILTER (WHERE t.priority = 'MEDIUM')   AS medium,
           COUNT(t.id) FILTER (WHERE t.priority = 'HIGH')     AS high
    FROM tasks t
    GROUP BY project_id
  ) t ON t.project_id = p.id
`;

export async function listProjects(): Promise<ProjectSummaryRow[]> {
  const result = await pool.query<ProjectSummaryRow>(
    `${SUMMARY_QUERY} ORDER BY p.created_at DESC, p.id`,
  );
  return result.rows;
}

export async function findProjectById(id: string): Promise<ProjectSummaryRow> {
  const result = await pool.query<ProjectSummaryRow>(
    `${SUMMARY_QUERY} WHERE p.id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) throw new ProjectNotFoundError(id);
  return row;
}

export async function createProject(input: CreateProjectInput): Promise<ProjectRow> {
  try {
    const result = await pool.query<ProjectRow>(
      `INSERT INTO projects (name, description)
       VALUES ($1, $2)
       RETURNING ${PROJECT_FIELDS}`,
      [input.name, input.description ?? null],
    );
    // `INSERT ... RETURNING` siempre devuelve la fila creada o lanza.
    //
    // Las tres columnas iniciales del tablero **no se crean aquí**: las pone un
    // trigger `AFTER INSERT` sobre `projects`. Hacerlo desde el servicio
    // dejaría fuera al seed, a `psql` y a cualquier otro cliente, que es el
    // mismo motivo por el que `completed_at` lo sella el motor y no la
    // aplicación. Un proyecto sin columnas no sería un tablero vacío sino uno
    // roto, donde no se puede crear ni una tarea.
    return result.rows[0]!;
  } catch (err) {
    throw translatePgError(err) ?? err;
  }
}

const UPDATABLE = { name: 'name', description: 'description' } as const;

export async function updateProject(id: string, patch: PatchProjectInput): Promise<ProjectRow> {
  const assignments: string[] = [];
  const values: unknown[] = [id];

  for (const key of Object.keys(patch) as (keyof typeof UPDATABLE)[]) {
    const column = UPDATABLE[key];
    if (!column) continue;
    values.push(patch[key] ?? null);
    assignments.push(`${column} = $${values.length}`);
  }

  // El esquema ya exige al menos un campo; esto protege al repositorio de ser
  // llamado desde otro sitio con un parche vacío.
  if (assignments.length === 0) throw new ProjectNotFoundError(id);

  try {
    const result = await pool.query<ProjectRow>(
      `UPDATE projects
       SET ${assignments.join(', ')}
       WHERE id = $1
       RETURNING ${PROJECT_FIELDS}`,
      values,
    );
    const row = result.rows[0];
    if (!row) throw new ProjectNotFoundError(id);
    return row;
  } catch (err) {
    if (err instanceof ProjectNotFoundError) throw err;
    throw translatePgError(err) ?? err;
  }
}

/**
 * Aquí vive la desambiguación del `23503`.
 *
 * Se comprobó contra PostgreSQL 16 que borrar un proyecto con tareas e
 * insertar una tarea con `project_id` inexistente devuelven exactamente los
 * mismos `code`, `constraint`, `table`, `schema` y `routine`. Un traductor
 * genérico no puede distinguirlos; este repositorio sí, porque sabe que está
 * borrando un padre.
 *
 * No se consulta antes de borrar: entre el `SELECT` y el `DELETE` cabría un
 * `INSERT` de otra petición. Se ejecuta y se traduce lo que devuelve el motor.
 */
export async function deleteProject(id: string): Promise<void> {
  let result;
  try {
    result = await pool.query<{ id: string }>(
      'DELETE FROM projects WHERE id = $1 RETURNING id',
      [id],
    );
  } catch (err) {
    if (isTaskProjectFkViolation(err)) throw new ProjectHasTasksError(err);
    throw translatePgError(err) ?? err;
  }

  // Si el proyecto no existía, la sentencia no toca ninguna fila y la clave
  // foránea nunca llega a evaluarse: por eso este 404 va fuera del `catch`.
  if (result.rowCount === 0) throw new ProjectNotFoundError(id);
}

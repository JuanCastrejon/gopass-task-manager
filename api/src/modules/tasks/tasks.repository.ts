import { pool } from '../../db/pool.js';
import { isTaskProjectFkViolation, translatePgError } from '../../db/pg-error.js';
import { ProjectNotFoundError, TaskNotFoundError } from '../../http/errors.js';
import type { TaskRow } from './tasks.mapper.js';
import type { CreateTaskInput, ListTasksQuery, PatchTaskInput } from './tasks.schema.js';

const TASK_FIELDS = `
  id, project_id, title, description, status, priority,
  completed_at, created_at, updated_at`;

const TASK_FIELDS_T = `
  t.id, t.project_id, t.title, t.description, t.status, t.priority,
  t.completed_at, t.created_at, t.updated_at`;

/**
 * Columnas escribibles. El nombre de columna sale siempre de este mapa, nunca
 * del payload: la clave validada por Zod solo sirve para elegir una entrada
 * escrita aquí.
 *
 * `completed_at` NO está, y es deliberado: la sella el trigger en la
 * transición hacia `DONE`. Meterla aquí abriría la puerta a violar el
 * `CHECK tasks_done_completed_at` desde una operación legítima.
 */
const WRITABLE = {
  title: 'title',
  description: 'description',
  status: 'status',
  priority: 'priority',
  projectId: 'project_id',
} as const;

type WritableKey = keyof typeof WRITABLE;

/**
 * Listar las tareas de un proyecto en **una sola consulta** que además
 * distingue "el proyecto no existe" de "el proyecto existe y no tiene
 * tareas".
 *
 * Devolver `[]` con 200 para un proyecto inexistente mentiría: el cliente
 * creería que existe y está vacío. Y hacer un `SELECT` de comprobación
 * seguido del listado serían dos viajes con una ventana entre ellos, el mismo
 * error que ya se evitó en el borrado.
 *
 * La clave está en que los filtros van en la condición del `LEFT JOIN` y no
 * en el `WHERE`: puestos en el `WHERE` eliminarían la fila del proyecto
 * cuando ninguna tarea casa, y un proyecto existente sin coincidencias se
 * convertiría en un 404 falso.
 *
 *   0 filas                    → el proyecto no existe
 *   1 fila con t.id NULL       → existe, sin tareas (o sin coincidencias)
 *   n filas                    → sus tareas
 */
const LIST_QUERY = `
  SELECT p.id AS project_exists, ${TASK_FIELDS_T}
  FROM projects p
  LEFT JOIN tasks t
    ON t.project_id = p.id
   AND ($2::task_status[]   IS NULL OR t.status   = ANY($2))
   AND ($3::task_priority[] IS NULL OR t.priority = ANY($3))
   AND ($4::text            IS NULL OR t.title ILIKE '%' || $4 || '%')
  WHERE p.id = $1
  ORDER BY t.priority DESC, t.created_at DESC, t.id`;

export async function listTasksByProject(
  projectId: string,
  filtros: ListTasksQuery = {},
): Promise<TaskRow[]> {
  const result = await pool.query<TaskRow & { project_exists: string | null }>(LIST_QUERY, [
    projectId,
    filtros.status ?? null,
    filtros.priority ?? null,
    filtros.q ?? null,
  ]);

  if (result.rows.length === 0) throw new ProjectNotFoundError(projectId);
  // La fila fantasma del LEFT JOIN: existe el proyecto, no hay tareas.
  return result.rows.filter((row) => row.id !== null);
}

export async function findTaskById(id: string): Promise<TaskRow> {
  const result = await pool.query<TaskRow>(
    `SELECT ${TASK_FIELDS} FROM tasks WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) throw new TaskNotFoundError(id);
  return row;
}

/**
 * El `INSERT` compone su lista de columnas a partir de los campos presentes.
 * Así, lo que el cliente no manda no se escribe y **la base aplica su propio
 * valor por defecto**, en lugar de duplicar `'TODO'` y `'MEDIUM'` en el
 * esquema Zod y en el SQL.
 */
export async function createTask(projectId: string, input: CreateTaskInput): Promise<TaskRow> {
  const columns = ['project_id'];
  const placeholders = ['$1'];
  const values: unknown[] = [projectId];

  for (const key of Object.keys(input) as WritableKey[]) {
    const column = WRITABLE[key];
    if (!column || column === 'project_id') continue;
    values.push(input[key as keyof CreateTaskInput] ?? null);
    columns.push(column);
    placeholders.push(`$${values.length}`);
  }

  try {
    const result = await pool.query<TaskRow>(
      `INSERT INTO tasks (${columns.join(', ')})
       VALUES (${placeholders.join(', ')})
       RETURNING ${TASK_FIELDS}`,
      values,
    );
    return result.rows[0]!;
  } catch (err) {
    // Aquí un 23503 solo puede significar que el proyecto padre no existe.
    if (isTaskProjectFkViolation(err)) throw new ProjectNotFoundError(projectId, err);
    throw translatePgError(err) ?? err;
  }
}

export async function updateTask(id: string, patch: PatchTaskInput): Promise<TaskRow> {
  const assignments: string[] = [];
  const values: unknown[] = [id];

  for (const key of Object.keys(patch) as WritableKey[]) {
    const column = WRITABLE[key];
    if (!column) continue;
    values.push(patch[key as keyof PatchTaskInput] ?? null);
    assignments.push(`${column} = $${values.length}`);
  }

  if (assignments.length === 0) throw new TaskNotFoundError(id);

  try {
    const result = await pool.query<TaskRow>(
      `UPDATE tasks SET ${assignments.join(', ')}
       WHERE id = $1
       RETURNING ${TASK_FIELDS}`,
      values,
    );
    const row = result.rows[0];
    if (!row) throw new TaskNotFoundError(id);
    return row;
  } catch (err) {
    if (err instanceof TaskNotFoundError) throw err;
    // Y aquí solo puede significar que el proyecto DESTINO no existe.
    if (isTaskProjectFkViolation(err)) {
      throw new ProjectNotFoundError(patch.projectId ?? 'desconocido', err);
    }
    throw translatePgError(err) ?? err;
  }
}

export async function deleteTask(id: string): Promise<void> {
  // Borrar una tarea no tiene restricción: nada la referencia.
  const result = await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
  if (result.rowCount === 0) throw new TaskNotFoundError(id);
}

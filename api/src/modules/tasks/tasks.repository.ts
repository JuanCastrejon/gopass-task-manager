import type { PoolClient } from 'pg';
import { pool } from '../../db/pool.js';
import { isTaskProjectFkViolation, translatePgError } from '../../db/pg-error.js';
import { ProjectNotFoundError, TaskNotFoundError, WipLimitReachedError } from '../../http/errors.js';
import type { TaskRow } from './tasks.mapper.js';
import type { CreateTaskInput, ListTasksQuery, PatchTaskInput } from './tasks.schema.js';

/**
 * Abre una transacción, la confirma si el trabajo termina bien y la revierte
 * si lanza. Existe porque la comprobación del límite y la escritura tienen que
 * ocurrir bajo el mismo bloqueo: separadas, el bloqueo se soltaría entre una y
 * otra y la condición de carrera volvería.
 */
async function conTransaccion<T>(trabajo: (cliente: PoolClient) => Promise<T>): Promise<T> {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await trabajo(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (err) {
    await cliente.query('ROLLBACK');
    throw err;
  } finally {
    cliente.release();
  }
}

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
/**
 * Comprueba el límite de trabajo en curso dentro de una transacción ya abierta.
 *
 * **`FOR UPDATE` sobre la fila del proyecto, y no un simple `SELECT count(*)`.**
 * Sin el bloqueo, dos peticiones simultáneas leen «2 de 3», las dos concluyen
 * que cabe una más y las dos insertan: el tablero acaba con 4 tareas en curso
 * y un límite de 3. Es la condición de carrera clásica de comprobar-y-actuar, y
 * la única forma de cerrarla aquí es serializar por proyecto. El bloqueo se
 * suelta al terminar la transacción.
 *
 * Se eligió bloquear la fila de `projects` y no las de `tasks` porque el
 * recurso en disputa es la capacidad del tablero, que es un atributo del
 * proyecto. Bloquear las tareas dejaría fuera a la que está a punto de entrar.
 */
async function verificarLimiteEnCurso(
  cliente: PoolClient,
  projectId: string,
  tareaQueEntra: string | null,
): Promise<void> {
  const proyecto = await cliente.query<{ wip_limit: number | null }>(
    'SELECT wip_limit FROM projects WHERE id = $1 FOR UPDATE',
    [projectId],
  );
  const limite = proyecto.rows[0]?.wip_limit ?? null;
  if (limite === null) return; // sin límite declarado: nada que imponer

  // La tarea que se está moviendo no debe contarse dos veces si ya estaba en
  // curso; sin esta exclusión, editarle el título a una tarea en curso con el
  // tablero lleno devolvería 409.
  const enCurso = await cliente.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM tasks
      WHERE project_id = $1 AND status = 'IN_PROGRESS' AND ($2::uuid IS NULL OR id <> $2)`,
    [projectId, tareaQueEntra],
  );

  if (Number(enCurso.rows[0]?.total ?? 0) >= limite) throw new WipLimitReachedError(limite);
}

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

  // Crear directamente en «En curso» consume capacidad igual que mover una
  // tarea existente, así que pasa por la misma puerta.
  const entraEnCurso = input.status === 'IN_PROGRESS';

  return conTransaccion(async (cliente) => {
    try {
      if (entraEnCurso) await verificarLimiteEnCurso(cliente, projectId, null);

      const result = await cliente.query<TaskRow>(
        `INSERT INTO tasks (${columns.join(', ')})
         VALUES (${placeholders.join(', ')})
         RETURNING ${TASK_FIELDS}`,
        values,
      );
      return result.rows[0]!;
    } catch (err) {
      if (err instanceof WipLimitReachedError) throw err;
      // Aquí un 23503 solo puede significar que el proyecto padre no existe.
      if (isTaskProjectFkViolation(err)) throw new ProjectNotFoundError(projectId, err);
      throw translatePgError(err) ?? err;
    }
  });
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

  return conTransaccion(async (cliente) => {
    try {
      // Solo se verifica cuando la tarea ENTRA en curso. Salir de «En curso» o
      // editar una que ya está dentro libera o no toca capacidad, y bloquear
      // esos casos convertiría el límite en una trampa: con el tablero lleno no
      // se podría ni corregir una errata.
      if (patch.status === 'IN_PROGRESS') {
        const destino = await cliente.query<{ project_id: string }>(
          'SELECT project_id FROM tasks WHERE id = $1',
          [id],
        );
        const proyectoDeLaTarea = patch.projectId ?? destino.rows[0]?.project_id;
        if (!proyectoDeLaTarea) throw new TaskNotFoundError(id);
        await verificarLimiteEnCurso(cliente, proyectoDeLaTarea, id);
      }

      const result = await cliente.query<TaskRow>(
        `UPDATE tasks SET ${assignments.join(', ')}
         WHERE id = $1
         RETURNING ${TASK_FIELDS}`,
        values,
      );
      const row = result.rows[0];
      if (!row) throw new TaskNotFoundError(id);
      return row;
    } catch (err) {
      if (err instanceof TaskNotFoundError || err instanceof WipLimitReachedError) throw err;
      // Y aquí solo puede significar que el proyecto DESTINO no existe.
      if (isTaskProjectFkViolation(err)) {
        throw new ProjectNotFoundError(patch.projectId ?? 'desconocido', err);
      }
      throw translatePgError(err) ?? err;
    }
  });
}

export async function deleteTask(id: string): Promise<void> {
  // Borrar una tarea no tiene restricción: nada la referencia.
  const result = await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
  if (result.rowCount === 0) throw new TaskNotFoundError(id);
}

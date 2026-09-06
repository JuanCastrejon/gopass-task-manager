import type { PoolClient } from 'pg';
import { pool } from '../../db/pool.js';
import { isPgError, translatePgError } from '../../db/pg-error.js';
import {
  AppError,
  ERROR_CODES,
  LabelHasTasksError,
  LabelNameTakenError,
  LabelNotFoundError,
  ProjectNotFoundError,
  TaskNotFoundError,
} from '../../http/errors.js';
import type { LabelRow } from './labels.mapper.js';
import type { CreateLabelInput, PatchLabelInput } from './labels.schema.js';

const LABEL_FIELDS = 'id, project_id, name, color, created_at, updated_at';

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

async function exigirProyecto(cliente: PoolClient, projectId: string): Promise<void> {
  const { rowCount } = await cliente.query('SELECT 1 FROM projects WHERE id = $1', [projectId]);
  if (rowCount === 0) throw new ProjectNotFoundError(projectId);
}

function esNombreRepetido(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === '23505' &&
    String((err as { constraint?: string }).constraint ?? '').includes('name')
  );
}

export async function listLabels(projectId: string): Promise<LabelRow[]> {
  const { rowCount } = await pool.query('SELECT 1 FROM projects WHERE id = $1', [projectId]);
  if (rowCount === 0) throw new ProjectNotFoundError(projectId);

  const { rows } = await pool.query<LabelRow>(
    `SELECT ${LABEL_FIELDS} FROM labels WHERE project_id = $1 ORDER BY name ASC`,
    [projectId],
  );
  return rows;
}

export async function findLabelById(id: string): Promise<LabelRow> {
  const { rows } = await pool.query<LabelRow>(
    `SELECT ${LABEL_FIELDS} FROM labels WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) throw new LabelNotFoundError(id);
  return row;
}

export async function createLabel(
  projectId: string,
  input: CreateLabelInput,
): Promise<LabelRow> {
  return conTransaccion(async (cliente) => {
    await exigirProyecto(cliente, projectId);

    try {
      const { rows } = await cliente.query<LabelRow>(
        `INSERT INTO labels (project_id, name, color)
         VALUES ($1, $2, $3)
         RETURNING ${LABEL_FIELDS}`,
        [projectId, input.name, input.color],
      );
      return rows[0]!;
    } catch (err) {
      if (esNombreRepetido(err)) throw new LabelNameTakenError(input.name, err);
      throw translatePgError(err) ?? err;
    }
  });
}

const UPDATABLE = { name: 'name', color: 'color' } as const;

export async function updateLabel(id: string, patch: PatchLabelInput): Promise<LabelRow> {
  return conTransaccion(async (cliente) => {
    const { rows: existentes } = await cliente.query<LabelRow>(
      `SELECT ${LABEL_FIELDS} FROM labels WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const actual = existentes[0];
    if (!actual) throw new LabelNotFoundError(id);

    const assignments: string[] = [];
    const values: unknown[] = [id];
    for (const key of Object.keys(patch) as (keyof typeof UPDATABLE)[]) {
      const column = UPDATABLE[key];
      if (!column) continue;
      values.push(patch[key] ?? null);
      assignments.push(`${column} = $${values.length}`);
    }

    try {
      const { rows } = await cliente.query<LabelRow>(
        `UPDATE labels SET ${assignments.join(', ')}
         WHERE id = $1
         RETURNING ${LABEL_FIELDS}`,
        values,
      );
      return rows[0]!;
    } catch (err) {
      if (esNombreRepetido(err)) throw new LabelNameTakenError(patch.name ?? '', err);
      throw translatePgError(err) ?? err;
    }
  });
}

export async function deleteLabel(id: string, confirm = false): Promise<void> {
  return conTransaccion(async (cliente) => {
    const { rows } = await cliente.query<{ id: string }>(
      'SELECT id FROM labels WHERE id = $1 FOR UPDATE',
      [id],
    );
    if (rows.length === 0) throw new LabelNotFoundError(id);

    const { rows: conteo } = await cliente.query<{ total: string }>(
      'SELECT COUNT(*) AS total FROM task_labels WHERE label_id = $1',
      [id],
    );
    const tareas = Number(conteo[0]?.total ?? 0);

    if (tareas > 0 && !confirm) {
      throw new LabelHasTasksError(tareas);
    }

    // Si tiene confirmación o tareas === 0, desasigna y borra atómicamente
    await cliente.query('DELETE FROM task_labels WHERE label_id = $1', [id]);
    await cliente.query('DELETE FROM labels WHERE id = $1', [id]);
  });
}

/**
 * Carga las etiquetas de un conjunto de tareas en una sola consulta secundaria:
 * WHERE task_id = ANY($1::uuid[])
 *
 * Mantiene LIST_QUERY intacta y evita multiplicar filas por LEFT JOIN.
 */
export async function getLabelsForTasks(taskIds: string[]): Promise<Map<string, LabelRow[]>> {
  const mapa = new Map<string, LabelRow[]>();
  if (taskIds.length === 0) return mapa;

  const { rows } = await pool.query<LabelRow & { task_id: string }>(
    `SELECT tl.task_id, l.id, l.project_id, l.name, l.color, l.created_at, l.updated_at
       FROM task_labels tl
       JOIN labels l ON l.id = tl.label_id
      WHERE tl.task_id = ANY($1::uuid[])
      ORDER BY l.name ASC`,
    [taskIds],
  );

  for (const row of rows) {
    const lista = mapa.get(row.task_id) ?? [];
    lista.push({
      id: row.id,
      project_id: row.project_id,
      name: row.name,
      color: row.color,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
    mapa.set(row.task_id, lista);
  }

  return mapa;
}

export async function getLabelsForTask(taskId: string): Promise<LabelRow[]> {
  const { rows } = await pool.query<LabelRow>(
    `SELECT l.id, l.project_id, l.name, l.color, l.created_at, l.updated_at
       FROM task_labels tl
       JOIN labels l ON l.id = tl.label_id
      WHERE tl.task_id = $1
      ORDER BY l.name ASC`,
    [taskId],
  );
  return rows;
}

/**
 * Reemplazo atómico e idempotente del conjunto completo de etiquetas de una tarea (PUT).
 *
 * Se apoya en la clave foránea compuesta (label_id, project_id) de task_labels:
 * Si una etiqueta pertenece a otro proyecto, el motor lanza 23503 y la transacción se aborta.
 */
export async function setTaskLabels(taskId: string, labelIds: string[]): Promise<LabelRow[]> {
  return conTransaccion(async (cliente) => {
    const { rows: taskRows } = await cliente.query<{ id: string; project_id: string }>(
      'SELECT id, project_id FROM tasks WHERE id = $1 FOR UPDATE',
      [taskId],
    );
    const task = taskRows[0];
    if (!task) throw new TaskNotFoundError(taskId);

    await cliente.query('DELETE FROM task_labels WHERE task_id = $1', [taskId]);

    if (labelIds.length > 0) {
      for (const labelId of labelIds) {
        try {
          await cliente.query(
            'INSERT INTO task_labels (task_id, label_id, project_id) VALUES ($1, $2, $3)',
            [taskId, labelId, task.project_id],
          );
        } catch (err) {
          if (isPgError(err) && err.code === '23503') {
            throw new AppError(
              400,
              ERROR_CODES.VALIDATION_ERROR,
              'La etiqueta no existe o no pertenece al proyecto de la tarea.',
              { cause: err },
            );
          }
          throw translatePgError(err) ?? err;
        }
      }
    }

    const { rows: assigned } = await cliente.query<LabelRow>(
      `SELECT l.id, l.project_id, l.name, l.color, l.created_at, l.updated_at
         FROM task_labels tl
         JOIN labels l ON l.id = tl.label_id
        WHERE tl.task_id = $1
        ORDER BY l.name ASC`,
      [taskId],
    );
    return assigned;
  });
}

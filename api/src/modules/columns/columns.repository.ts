import type { PoolClient } from 'pg';
import { pool } from '../../db/pool.js';
import { translatePgError } from '../../db/pg-error.js';
import {
  ColumnHasTasksError,
  ColumnNameTakenError,
  ColumnNotFoundError,
  LastColumnOfCategoryError,
  ProjectNotFoundError,
  WipLimitReachedError,
} from '../../http/errors.js';
import type { ProjectColumnRow, ProjectColumnSummaryRow } from './columns.mapper.js';
import type { CreateColumnInput, PatchColumnInput } from './columns.schema.js';

const COLUMN_FIELDS =
  'id, project_id, name, category, position, wip_limit, sort, created_at, updated_at';

/**
 * Abre una transacción, la confirma si el trabajo termina bien y la revierte
 * si lanza. Varias operaciones de este módulo son de varios pasos —borrar
 * reasignando, reordenar— y ninguna puede dejar el tablero a medias.
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

/** El proyecto existe. Se comprueba antes para devolver 404 y no una lista vacía. */
async function exigirProyecto(cliente: PoolClient, projectId: string): Promise<void> {
  const { rowCount } = await cliente.query('SELECT 1 FROM projects WHERE id = $1', [projectId]);
  if (rowCount === 0) throw new ProjectNotFoundError(projectId);
}

/** La columna existe **y pertenece a este proyecto**. Sin lo segundo, un id de otro tablero pasaría. */
async function exigirColumna(
  cliente: PoolClient,
  projectId: string,
  columnId: string,
  bloquear = false,
): Promise<ProjectColumnRow> {
  const { rows } = await cliente.query<ProjectColumnRow>(
    `SELECT ${COLUMN_FIELDS} FROM project_columns
      WHERE id = $1 AND project_id = $2${bloquear ? ' FOR UPDATE' : ''}`,
    [columnId, projectId],
  );
  const fila = rows[0];
  if (!fila) throw new ColumnNotFoundError(columnId);
  return fila;
}

export async function listColumns(projectId: string): Promise<ProjectColumnSummaryRow[]> {
  const { rows } = await pool.query<ProjectColumnSummaryRow>(
    `SELECT pc.${COLUMN_FIELDS.split(', ').join(', pc.')},
            COUNT(t.id)::int AS task_count
       FROM project_columns pc
       LEFT JOIN tasks t ON t.column_id = pc.id
      WHERE pc.project_id = $1
      GROUP BY pc.id
      ORDER BY pc.position`,
    [projectId],
  );
  // Una lista vacía significa proyecto inexistente: la migración garantiza que
  // todo proyecto tiene columnas, y crear uno nuevo las crea también.
  if (rows.length === 0) {
    const { rowCount } = await pool.query('SELECT 1 FROM projects WHERE id = $1', [projectId]);
    if (rowCount === 0) throw new ProjectNotFoundError(projectId);
  }
  return rows;
}

export async function createColumn(
  projectId: string,
  input: CreateColumnInput,
): Promise<ProjectColumnRow> {
  return conTransaccion(async (cliente) => {
    await exigirProyecto(cliente, projectId);

    // La posición se calcula en el servidor, dentro de la transacción: si la
    // eligiera el cliente, dos creaciones simultáneas pedirían la misma y una
    // chocaría contra el índice único por una razón que no es suya.
    try {
      const { rows } = await cliente.query<ProjectColumnRow>(
        `INSERT INTO project_columns (project_id, name, category, position, wip_limit, sort)
         VALUES ($1, $2, $3::task_status,
                 (SELECT COALESCE(MAX(position), 0) + 1 FROM project_columns WHERE project_id = $1),
                 $4, COALESCE($5::column_sort, 'priority_desc'))
         RETURNING ${COLUMN_FIELDS}`,
        [projectId, input.name, input.category, input.wipLimit ?? null, input.sort ?? null],
      );
      return rows[0]!;
    } catch (err) {
      if (esNombreRepetido(err)) throw new ColumnNameTakenError(input.name, err);
      throw translatePgError(err) ?? err;
    }
  });
}

const UPDATABLE = { name: 'name', wipLimit: 'wip_limit', sort: 'sort' } as const;

export async function updateColumn(
  projectId: string,
  columnId: string,
  patch: PatchColumnInput,
): Promise<ProjectColumnRow> {
  return conTransaccion(async (cliente) => {
    const actual = await exigirColumna(cliente, projectId, columnId, true);

    // Poner límite a una columna terminal no significa nada y la base lo
    // rechazaría con un `CHECK`; se traduce antes para que el mensaje hable
    // del dominio y no de una restricción.
    if (patch.wipLimit != null && actual.category === 'DONE') {
      throw new WipLimitReachedError(patch.wipLimit);
    }

    const assignments: string[] = [];
    const values: unknown[] = [columnId];
    for (const key of Object.keys(patch) as (keyof typeof UPDATABLE)[]) {
      const column = UPDATABLE[key];
      if (!column) continue;
      values.push(patch[key] ?? null);
      assignments.push(`${column} = $${values.length}`);
    }
    if (assignments.length === 0) throw new ColumnNotFoundError(columnId);

    try {
      const { rows } = await cliente.query<ProjectColumnRow>(
        `UPDATE project_columns SET ${assignments.join(', ')}
          WHERE id = $1 RETURNING ${COLUMN_FIELDS}`,
        values,
      );
      return rows[0]!;
    } catch (err) {
      if (esNombreRepetido(err)) throw new ColumnNameTakenError(patch.name ?? '', err);
      throw translatePgError(err) ?? err;
    }
  });
}

/**
 * Borrar una columna.
 *
 * Sin `reassignTo`, una columna con tareas devuelve 409 y dice cuántas hay:
 * mismo criterio que borrar un proyecto con tareas (ADR-003), porque destruir
 * trabajo ajeno por omisión no es una opción razonable.
 *
 * Con `reassignTo`, mover y borrar ocurren en la misma transacción. Si la
 * columna destino tiene otra categoría, el `status` de las tareas cambia con
 * ellas —la clave foránea compuesta obliga a moverlos juntos— y el trigger
 * sella o limpia `completed_at` en consecuencia. Es un efecto grande, así que
 * lo pide el cliente de forma explícita y nunca se deduce.
 */
export async function deleteColumn(
  projectId: string,
  columnId: string,
  reassignTo?: string,
): Promise<void> {
  return conTransaccion(async (cliente) => {
    const columna = await exigirColumna(cliente, projectId, columnId, true);

    // Un tablero sin columnas de una categoría deja de ser un flujo: sin
    // `DONE` no hay forma de terminar nada.
    const { rows: hermanas } = await cliente.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM project_columns
        WHERE project_id = $1 AND category = $2 AND id <> $3`,
      [projectId, columna.category, columnId],
    );
    if (Number(hermanas[0]?.total ?? 0) === 0) {
      throw new LastColumnOfCategoryError(columna.category);
    }

    const { rows: conteo } = await cliente.query<{ total: string }>(
      'SELECT COUNT(*) AS total FROM tasks WHERE column_id = $1',
      [columnId],
    );
    const tareas = Number(conteo[0]?.total ?? 0);

    if (tareas > 0) {
      if (!reassignTo) throw new ColumnHasTasksError(tareas);

      const destino = await exigirColumna(cliente, projectId, reassignTo, true);
      if (destino.id === columnId) throw new ColumnNotFoundError(reassignTo);

      // El destino también tiene su límite, y reasignar no es una excusa para
      // saltárselo. Se comprueba con las dos columnas ya bloqueadas.
      if (destino.wip_limit !== null) {
        const { rows: enDestino } = await cliente.query<{ total: string }>(
          'SELECT COUNT(*) AS total FROM tasks WHERE column_id = $1',
          [destino.id],
        );
        if (Number(enDestino[0]?.total ?? 0) + tareas > destino.wip_limit) {
          throw new WipLimitReachedError(destino.wip_limit);
        }
      }

      // `status` viaja con `column_id`: la clave foránea compuesta los mantiene
      // unidos y el trigger de `completed_at` reacciona al cambio de estado.
      await cliente.query('UPDATE tasks SET column_id = $1, status = $2 WHERE column_id = $3', [
        destino.id,
        destino.category,
        columnId,
      ]);
    }

    await cliente.query('DELETE FROM project_columns WHERE id = $1', [columnId]);
    await recompactarPosiciones(cliente, projectId);
  });
}

/**
 * Reordenar el tablero entero.
 *
 * Se recibe el orden completo y no un desplazamiento, porque un intercambio en
 * dos sentencias dejaría un instante con dos columnas en la misma posición. Se
 * escriben todas dentro de la transacción y el índice único, declarado
 * `DEFERRABLE`, se comprueba al confirmar.
 */
export async function reorderColumns(projectId: string, columnIds: string[]): Promise<void> {
  return conTransaccion(async (cliente) => {
    await exigirProyecto(cliente, projectId);
    await cliente.query('SET CONSTRAINTS project_columns_project_position_key DEFERRED');

    const { rows } = await cliente.query<{ id: string }>(
      'SELECT id FROM project_columns WHERE project_id = $1 FOR UPDATE',
      [projectId],
    );
    const existentes = new Set(rows.map((r) => r.id));

    // El orden recibido tiene que ser exactamente el conjunto actual: aceptar
    // una lista parcial dejaría columnas sin posición asignada, y aceptar ids
    // ajenos movería columnas de otro tablero.
    if (columnIds.length !== existentes.size || columnIds.some((id) => !existentes.has(id))) {
      throw new ColumnNotFoundError(columnIds.find((id) => !existentes.has(id)) ?? 'incompleto');
    }

    for (const [indice, id] of columnIds.entries()) {
      await cliente.query('UPDATE project_columns SET position = $1 WHERE id = $2', [
        indice + 1,
        id,
      ]);
    }
  });
}

/** Tras un borrado, las posiciones dejan un hueco. Se cierran para que sigan siendo 1..N. */
async function recompactarPosiciones(cliente: PoolClient, projectId: string): Promise<void> {
  await cliente.query('SET CONSTRAINTS project_columns_project_position_key DEFERRED');
  await cliente.query(
    `UPDATE project_columns pc
        SET position = ordenadas.nueva
       FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY position) AS nueva
               FROM project_columns WHERE project_id = $1) ordenadas
      WHERE pc.id = ordenadas.id AND pc.position <> ordenadas.nueva`,
    [projectId],
  );
}

/** El 23505 de este módulo solo puede venir del índice único de nombre por proyecto. */
function esNombreRepetido(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === '23505' &&
    String((err as { constraint?: string }).constraint ?? '').includes('name')
  );
}

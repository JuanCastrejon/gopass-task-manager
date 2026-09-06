import type { PoolClient } from 'pg';
import { pool } from '../../db/pool.js';
import { isPgError, isTaskProjectFkViolation, translatePgError } from '../../db/pg-error.js';
import {
  ColumnNotFoundError,
  ProjectNotFoundError,
  TaskNotFoundError,
  ValidationError,
  WipLimitReachedError,
} from '../../http/errors.js';
import type { TaskRow } from './tasks.mapper.js';
import type {
  CreateTaskInput,
  ListTasksQuery,
  PatchTaskInput,
  ReorderTaskInput,
} from './tasks.schema.js';

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
  id, project_id, column_id, title, description, status, priority, position,
  completed_at, created_at, updated_at`;

const TASK_FIELDS_T = `
  t.id, t.project_id, t.column_id, t.title, t.description, t.status, t.priority, t.position,
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
  columnId: 'column_id',
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
 *
 * **El orden lo decide cada columna, y aun así es una sola consulta.** La
 * escalera de `CASE` sobre `pc.sort` deja en NULL todas las ramas salvo la del
 * criterio activo de esa columna, así que solo una tiene efecto. Se verificó
 * contra PostgreSQL que tres columnas con tres criterios distintos salen
 * correctamente ordenadas de una sola pasada: no hacen falta N peticiones ni
 * ordenar en cliente sobre un array ya descargado, que es justo lo que RF-13
 * prohíbe para los filtros.
 *
 * El desempate final (`created_at DESC, t.id`) mantiene el orden estable
 * cuando el criterio elegido empata, para que dos cargas seguidas no
 * intercambien tarjetas.
 */
const LIST_QUERY = `
  SELECT p.id AS project_exists, ${TASK_FIELDS_T}
  FROM projects p
  LEFT JOIN tasks t
    ON t.project_id = p.id
   AND ($2::task_status[]   IS NULL OR t.status   = ANY($2))
   AND ($3::task_priority[] IS NULL OR t.priority = ANY($3))
   AND ($4::text            IS NULL OR t.title ILIKE '%' || $4 || '%')
  LEFT JOIN project_columns pc ON pc.id = t.column_id
  WHERE p.id = $1
  ORDER BY pc.position,
    CASE pc.sort WHEN 'manual'        THEN t.position   END ASC,
    CASE pc.sort WHEN 'priority_asc'  THEN t.priority   END ASC,
    CASE pc.sort WHEN 'priority_desc' THEN t.priority   END DESC,
    CASE pc.sort WHEN 'created_asc'   THEN t.created_at END ASC,
    CASE pc.sort WHEN 'created_desc'  THEN t.created_at END DESC,
    t.created_at DESC, t.id`;

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
async function verificarLimiteDeColumna(
  cliente: PoolClient,
  columnId: string,
  tareaQueEntra: string | null,
): Promise<void> {
  const columna = await cliente.query<{ wip_limit: number | null }>(
    'SELECT wip_limit FROM project_columns WHERE id = $1 FOR UPDATE',
    [columnId],
  );
  const limite = columna.rows[0]?.wip_limit ?? null;
  if (limite === null) return; // sin límite declarado: nada que imponer

  // La tarea que se está moviendo no debe contarse dos veces si ya estaba en
  // esta columna; sin esta exclusión, editarle el título a una tarea con la
  // columna llena devolvería 409.
  const dentro = await cliente.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM tasks
      WHERE column_id = $1 AND ($2::uuid IS NULL OR id <> $2)`,
    [columnId, tareaQueEntra],
  );

  if (Number(dentro.rows[0]?.total ?? 0) >= limite) throw new WipLimitReachedError(limite);
}

/**
 * La columna destino, con su categoría. Se necesita para dos cosas: comprobar
 * que pertenece al proyecto de la tarea, y derivar el `status` que debe viajar
 * con ella —la clave foránea compuesta obliga a mover los dos juntos—.
 */
async function columnaDestino(
  cliente: PoolClient,
  projectId: string,
  columnId: string,
): Promise<{ id: string; category: string }> {
  const { rows } = await cliente.query<{ id: string; category: string }>(
    'SELECT id, category FROM project_columns WHERE id = $1 AND project_id = $2',
    [columnId, projectId],
  );
  const fila = rows[0];
  if (!fila) throw new ColumnNotFoundError(columnId);
  return fila;
}

/** La columna por defecto de un proyecto: la primera de su tablero. */
async function primeraColumna(cliente: PoolClient, projectId: string): Promise<{ id: string; category: string }> {
  const { rows } = await cliente.query<{ id: string; category: string }>(
    'SELECT id, category FROM project_columns WHERE project_id = $1 ORDER BY position LIMIT 1',
    [projectId],
  );
  const fila = rows[0];
  if (!fila) throw new ProjectNotFoundError(projectId);
  return fila;
}

/**
 * Resuelve en qué columna entra una tarea.
 *
 * El contrato admite dos formas y **`columnId` gana** cuando llegan las dos:
 * es la precisa, porque un proyecto puede tener varias columnas de la misma
 * categoría. `status` se conserva porque sigue siendo la forma natural de
 * decir «ponla en curso» sin conocer los identificadores del tablero, y
 * traduce a la primera columna de esa categoría por posición.
 *
 * Devuelve también el `status`, que no es redundante: la clave foránea
 * compuesta obliga a escribir los dos juntos, y de él dependen el `CHECK` y el
 * trigger de `completed_at`.
 */
async function resolverColumna(
  cliente: PoolClient,
  projectId: string,
  columnId?: string | undefined,
  status?: string | undefined,
): Promise<{ id: string; category: string } | null> {
  if (columnId) return columnaDestino(cliente, projectId, columnId);
  if (!status) return null;

  const { rows } = await cliente.query<{ id: string; category: string }>(
    `SELECT id, category FROM project_columns
      WHERE project_id = $1 AND category = $2 ORDER BY position LIMIT 1`,
    [projectId, status],
  );
  const fila = rows[0];
  if (!fila) throw new ProjectNotFoundError(projectId);
  return fila;
}

export async function createTask(projectId: string, input: CreateTaskInput): Promise<TaskRow> {
  return conTransaccion(async (cliente) => {
    try {
      // Sin columna ni estado, la tarea nace en la primera columna del tablero,
      // que es el equivalente al antiguo `DEFAULT 'TODO'`.
      const destino =
        (await resolverColumna(cliente, projectId, input.columnId, input.status)) ??
        (await primeraColumna(cliente, projectId));

      await verificarLimiteDeColumna(cliente, destino.id, null);

      const columns = ['project_id', 'column_id', 'status'];
      const values: unknown[] = [projectId, destino.id, destino.category];

      for (const key of Object.keys(input) as WritableKey[]) {
        const column = WRITABLE[key];
        // `status` y `column_id` ya están puestos por el destino resuelto.
        if (!column || column === 'project_id' || column === 'status' || column === 'column_id') {
          continue;
        }
        values.push(input[key as keyof CreateTaskInput] ?? null);
        columns.push(column);
      }

      const result = await cliente.query<TaskRow>(
        `INSERT INTO tasks (${columns.join(', ')})
         VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})
         RETURNING ${TASK_FIELDS}`,
        values,
      );
      return result.rows[0]!;
    } catch (err) {
      if (err instanceof WipLimitReachedError || err instanceof ColumnNotFoundError) throw err;
      // Aquí un 23503 solo puede significar que el proyecto padre no existe.
      if (isTaskProjectFkViolation(err)) throw new ProjectNotFoundError(projectId, err);
      throw translatePgError(err) ?? err;
    }
  });
}

export async function updateTask(id: string, patch: PatchTaskInput): Promise<TaskRow> {
  return conTransaccion(async (cliente) => {
    try {
      const actual = await cliente.query<{
        project_id: string;
        column_id: string;
        status: string;
      }>('SELECT project_id, column_id, status FROM tasks WHERE id = $1', [id]);
      const tarea = actual.rows[0];
      if (!tarea) throw new TaskNotFoundError(id);

      const proyectoDeLaTarea = patch.projectId ?? tarea.project_id;
      const cambiaDeProyecto = patch.projectId !== undefined && patch.projectId !== tarea.project_id;

      /**
       * Reasignar una tarea a otro proyecto obliga a recolocarla.
       *
       * Su columna actual pertenece al proyecto de origen, y la clave foránea
       * compuesta `(project_id, column_id)` rechazaría dejarla ahí. Cuando
       * nadie dice a qué columna va, se busca la equivalente por categoría en
       * el destino: una tarea en curso sigue en curso al cambiar de proyecto,
       * que es lo que el usuario espera y lo que hacía antes de que las
       * columnas existieran.
       */
      const destino = await resolverColumna(
        cliente,
        proyectoDeLaTarea,
        patch.columnId,
        patch.status ?? (cambiaDeProyecto ? tarea.status : undefined),
      );

      const assignments: string[] = [];
      const values: unknown[] = [id];

      for (const key of Object.keys(patch) as WritableKey[]) {
        const column = WRITABLE[key];
        // El destino se escribe aparte, con `status` y `column_id` a la vez.
        if (!column || column === 'status' || column === 'column_id') continue;
        values.push(patch[key as keyof PatchTaskInput] ?? null);
        assignments.push(`${column} = $${values.length}`);
      }

      if (destino) {
        // Solo se verifica el límite cuando la tarea CAMBIA de columna. Editar
        // una que ya está dentro no consume capacidad nueva, y bloquearlo
        // convertiría el límite en una trampa: con la columna llena no se
        // podría ni corregir una errata.
        if (destino.id !== tarea.column_id) {
          await verificarLimiteDeColumna(cliente, destino.id, id);

          // Al cambiar de columna, la tarea debe recibir una posición nueva al final
          // de la columna de destino para evitar conservar la posición de la columna
          // anterior (lo que violaría la restricción unique tasks_position_unica si
          // ya está ocupada, o dejaría la tarjeta en un orden arbitrario).
          const maxPosResult = await cliente.query<{ max_pos: number | null }>(
            'SELECT MAX(position) AS max_pos FROM tasks WHERE column_id = $1',
            [destino.id],
          );
          const nuevaPosicion = (Number(maxPosResult.rows[0]?.max_pos) || 0) + 1024.0;
          values.push(nuevaPosicion);
          assignments.push(`position = $${values.length}`);
        }
        values.push(destino.id);
        assignments.push(`column_id = $${values.length}`);
        // Viajan juntos por obligación de la clave foránea compuesta, y de
        // `status` depende el trigger que sella o limpia `completed_at`.
        values.push(destino.category);
        assignments.push(`status = $${values.length}`);
      }

      if (assignments.length === 0) throw new TaskNotFoundError(id);

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
      if (
        err instanceof TaskNotFoundError ||
        err instanceof WipLimitReachedError ||
        err instanceof ColumnNotFoundError ||
        err instanceof ProjectNotFoundError
      ) {
        throw err;
      }
      // Y aquí solo puede significar que el proyecto DESTINO no existe.
      if (isTaskProjectFkViolation(err)) {
        throw new ProjectNotFoundError(patch.projectId ?? 'desconocido', err);
      }
      throw translatePgError(err) ?? err;
    }
  });
}

/**
 * Reordena una tarea dentro de su columna o hacia otra columna entre dos tarjetas vecinas.
 *
 * El servidor calcula la nueva posición fraccionaria para que el cliente no maneje
 * números ni límites de precisión IEEE 754.
 *
 * Si se detecta colisión contra la restricción `tasks_position_unica` (23505) o
 * desbordamiento aritmético por división (22003), se revierte el punto de guardado
 * (SAVEPOINT), se rebalancea la columna en dos pasos con `ROW_NUMBER() * 1024` y se
 * reintenta una sola vez. Si el reintento falla, el error se propaga para evitar bucles.
 */
export async function reorderTask(id: string, input: ReorderTaskInput): Promise<TaskRow> {
  return conTransaccion(async (cliente) => {
    try {
      const actual = await cliente.query<{
        id: string;
        project_id: string;
        column_id: string;
        status: string;
      }>('SELECT id, project_id, column_id, status FROM tasks WHERE id = $1 FOR UPDATE', [id]);
      const tarea = actual.rows[0];
      if (!tarea) throw new TaskNotFoundError(id);

      const destino = await columnaDestino(cliente, tarea.project_id, input.columnId);

      if (destino.id !== tarea.column_id) {
        await verificarLimiteDeColumna(cliente, destino.id, id);
      }

      if (input.previousTaskId === id || input.nextTaskId === id) {
        throw new ValidationError([
          { path: 'body', message: 'Una tarea no puede ser anterior ni siguiente de sí misma.' },
        ]);
      }

      const obtenerPosicionVecina = async (vecinaId: string): Promise<number> => {
        const res = await cliente.query<{ position: number }>(
          'SELECT position FROM tasks WHERE id = $1 AND column_id = $2',
          [vecinaId, destino.id],
        );
        const fila = res.rows[0];
        if (!fila) throw new TaskNotFoundError(vecinaId);
        return Number(fila.position);
      };

      const calcularPosicion = async (): Promise<number> => {
        // Ambas vecinas nulas significa «al final de la columna»: petición legítima
        // y siempre satisfacible (`MAX(position) + 1024.0`, o `1024.0` si está vacía).
        // Se excluye la propia tarea (id <> $2) por si ya residía en esa columna.
        if (!input.previousTaskId && !input.nextTaskId) {
          const res = await cliente.query<{ max_pos: number | null }>(
            'SELECT MAX(position) AS max_pos FROM tasks WHERE column_id = $1 AND id <> $2',
            [destino.id, id],
          );
          const maxPos = res.rows[0]?.max_pos;
          return maxPos != null ? Number(maxPos) + 1024.0 : 1024.0;
        }
        if (!input.previousTaskId && input.nextTaskId) {
          const nextPos = await obtenerPosicionVecina(input.nextTaskId);
          return nextPos / 2.0;
        }
        if (input.previousTaskId && !input.nextTaskId) {
          const prevPos = await obtenerPosicionVecina(input.previousTaskId);
          return prevPos + 1024.0;
        }
        const prevPos = await obtenerPosicionVecina(input.previousTaskId!);
        const nextPos = await obtenerPosicionVecina(input.nextTaskId!);
        return (prevPos + nextPos) / 2.0;
      };

      const rebalancearColumna = async (): Promise<void> => {
        // Se renumera temporalmente a negativo para que la actualización fila por fila
        // no colisione con las posiciones positivas existentes en la restricción UNIQUE.
        await cliente.query(
          `UPDATE tasks t
              SET position = -(sub.rn * 1024.0)
             FROM (
               SELECT id, ROW_NUMBER() OVER (ORDER BY position ASC, created_at DESC, id) AS rn
                 FROM tasks
                WHERE column_id = $1
             ) sub
            WHERE t.id = sub.id`,
          [destino.id],
        );
        await cliente.query('UPDATE tasks SET position = -position WHERE column_id = $1', [destino.id]);
      };

      let nuevaPosicion = await calcularPosicion();

      await cliente.query('SAVEPOINT reorder_intento');
      try {
        const result = await cliente.query<TaskRow>(
          `UPDATE tasks
              SET column_id = $2,
                  status = $3,
                  position = $4
            WHERE id = $1
           RETURNING ${TASK_FIELDS}`,
          [id, destino.id, destino.category, nuevaPosicion],
        );
        await cliente.query('RELEASE SAVEPOINT reorder_intento');
        return result.rows[0]!;
      } catch (err) {
        const esColision =
          isPgError(err) &&
          ((err.code === '23505' && err.constraint === 'tasks_position_unica') ||
            err.code === '22003');

        if (!esColision) {
          await cliente.query('ROLLBACK TO SAVEPOINT reorder_intento');
          throw err;
        }

        // Se restaura el punto de guardado de la transacción para limpiar el estado
        // de error antes de ejecutar el rebalanceo de la columna en conflicto.
        await cliente.query('ROLLBACK TO SAVEPOINT reorder_intento');
        await rebalancearColumna();

        // Tras redistribuir las tarjetas con huecos de 1024.0, se recalculan
        // las posiciones de las vecinas para obtener un nuevo punto medio espacioso.
        nuevaPosicion = await calcularPosicion();

        const reintento = await cliente.query<TaskRow>(
          `UPDATE tasks
              SET column_id = $2,
                  status = $3,
                  position = $4
            WHERE id = $1
           RETURNING ${TASK_FIELDS}`,
          [id, destino.id, destino.category, nuevaPosicion],
        );
        return reintento.rows[0]!;
      }
    } catch (err) {
      if (
        err instanceof TaskNotFoundError ||
        err instanceof WipLimitReachedError ||
        err instanceof ColumnNotFoundError ||
        err instanceof ProjectNotFoundError ||
        err instanceof ValidationError
      ) {
        throw err;
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

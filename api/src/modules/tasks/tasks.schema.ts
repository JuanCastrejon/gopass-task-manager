import { z } from 'zod';

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'] as const;
export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;

/**
 * El dominio se declara una sola vez y los tipos se derivan de él. Antes la
 * unión estaba además escrita a mano en `tasks.mapper.ts`, así que añadir una
 * prioridad exigía acordarse de tocar dos sitios y el compilador no avisaba
 * del que faltara.
 */
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const taskIdParamsSchema = z.object({
  id: z.string().uuid('El identificador debe ser un UUID.'),
});

export const projectScopedParamsSchema = z.object({
  projectId: z.string().uuid('El identificador de proyecto debe ser un UUID.'),
});

/**
 * `.strict()` en los esquemas de escritura.
 *
 * `completedAt` no se acepta: lo sella la base en la transición hacia `DONE`
 * y la aplicación no lo escribe nunca. Zod por defecto **descarta en
 * silencio** las claves desconocidas, así que sin `.strict()` un cliente que
 * mandara `{"status":"DONE","completedAt":"2020-01-01"}` recibiría un 200 y
 * creería que guardó esa fecha.
 *
 * El mismo mecanismo atrapa las erratas: `{"staus":"DONE"}` sería un parche
 * vacío silencioso en vez de un 400 que dice qué pasa.
 *
 * No se aplica a `params` ni a `query`: ahí las claves de más las pone el
 * navegador o el enrutador, no el cliente.
 */
const strictMessage = 'Campo no reconocido o de solo lectura.';

export const createTaskSchema = z
  .object({
    title: z.string().trim().min(1, 'El título no puede estar vacío.').max(200, 'El título supera los 200 caracteres.'),
    description: z.string().trim().max(5000).nullish(),
    status: z.enum(TASK_STATUSES).optional(),
    /**
     * Columna concreta del tablero. Gana sobre `status` cuando llegan las dos,
     * porque un proyecto puede tener varias columnas de la misma categoría y
     * solo el identificador dice cuál.
     */
    columnId: z.string().uuid('El identificador de columna debe ser un UUID.').optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
  })
  .strict(strictMessage);

export const patchTaskSchema = z
  .object({
    title: z.string().trim().min(1, 'El título no puede estar vacío.').max(200, 'El título supera los 200 caracteres.').optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    status: z.enum(TASK_STATUSES).optional(),
    /** Ver la nota de `createTaskSchema`: gana sobre `status`. */
    columnId: z.string().uuid('El identificador de columna debe ser un UUID.').optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    /**
     * Reasignar la tarea a otro proyecto.
     *
     * Entra porque el 409 de borrado de proyecto dice que hay que eliminar o
     * mover las tareas primero: sin esto, esa frase sería una promesa que la
     * API no puede cumplir. Cuesta una entrada en el mapa de columnas y una
     * rama en el `catch`, y reutiliza la traducción del `23503` que ya
     * existe.
     */
    projectId: z.string().uuid('El identificador de proyecto debe ser un UUID.').optional(),
  })
  .strict(strictMessage)
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Envía al menos un campo para actualizar.',
  });

/**
 * Filtros del listado (RF-13). `z.preprocess` normaliza el hecho de que
 * Express entrega un string cuando el parámetro aparece una vez y un array
 * cuando se repite.
 */
const repeatable = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .preprocess(
      (raw) => (raw === undefined ? undefined : Array.isArray(raw) ? raw : [raw]),
      z.array(z.enum(values)).min(1, 'El filtro no puede ir vacío.'),
    )
    // Repetir el mismo valor no debería cambiar la consulta.
    .transform((list) => [...new Set(list)])
    .optional();

export const listTasksQuerySchema = z.object({
  status: repeatable(TASK_STATUSES),
  priority: repeatable(TASK_PRIORITIES),
  q: z.string().trim().min(1).max(200).optional(),
});

/**
 * Reordenación de una tarea entre dos vecinas o al inicio/fin de una columna.
 *
 * El cliente envía las tareas entre las que desea ubicar la suya (`previousTaskId`
 * y `nextTaskId`) y no la posición numérica: así la invariante de cálculo y la
 * gestión de precisión viven exclusivamente en el servidor, impidiendo que un
 * cliente defectuoso escriba posiciones arbitrarias.
 *
 * Semántica de límites y vecinas nulas:
 * - `previousTaskId` null y `nextTaskId` presente: ubicar al inicio de la columna (`next / 2`).
 * - `previousTaskId` presente y `nextTaskId` null: ubicar a continuación de `previousTaskId` (`prev + 1024`).
 * - Ambas presentes: ubicar en el punto medio entre ambas (`(prev + next) / 2`).
 * - Ambas nulas: ubicar al final de la columna (`MAX(position) + 1024`, o `1024` si está vacía).
 */
export const reorderTaskSchema = z
  .object({
    columnId: z.string().uuid('El identificador de columna debe ser un UUID.'),
    previousTaskId: z.string().uuid('El identificador de la tarea anterior debe ser un UUID.').nullable(),
    nextTaskId: z.string().uuid('El identificador de la tarea siguiente debe ser un UUID.').nullable(),
  })
  .strict(strictMessage);

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type PatchTaskInput = z.infer<typeof patchTaskSchema>;
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
export type ReorderTaskInput = z.infer<typeof reorderTaskSchema>;


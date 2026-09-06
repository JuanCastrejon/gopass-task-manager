/**
 * Catálogo de errores de la aplicación.
 *
 * `code` es el contrato estable con el cliente: el frontend decide qué
 * mensaje mostrar a partir de él y nunca compara contra `title` o `detail`,
 * que son texto para humanos y pueden cambiar sin romper nada.
 */

export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',
  TASK_NOT_FOUND: 'TASK_NOT_FOUND',
  PROJECT_NAME_TAKEN: 'PROJECT_NAME_TAKEN',
  PROJECT_HAS_TASKS: 'PROJECT_HAS_TASKS',
  WIP_LIMIT_REACHED: 'WIP_LIMIT_REACHED',
  COLUMN_NOT_FOUND: 'COLUMN_NOT_FOUND',
  COLUMN_HAS_TASKS: 'COLUMN_HAS_TASKS',
  COLUMN_NAME_TAKEN: 'COLUMN_NAME_TAKEN',
  LAST_COLUMN_OF_CATEGORY: 'LAST_COLUMN_OF_CATEGORY',
  ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface FieldIssue {
  path: string;
  message: string;
}

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly issues?: FieldIssue[];

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    options?: { issues?: FieldIssue[]; cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    if (options?.issues) this.issues = options.issues;
  }
}

export class ValidationError extends AppError {
  constructor(issues: FieldIssue[], cause?: unknown) {
    super(400, ERROR_CODES.VALIDATION_ERROR, 'Payload inválido.', { issues, ...(cause !== undefined ? { cause } : {}) });
  }
}

export class ProjectNotFoundError extends AppError {
  constructor(id: string, cause?: unknown) {
    super(404, ERROR_CODES.PROJECT_NOT_FOUND, `No existe un proyecto con id ${id}.`,
      cause !== undefined ? { cause } : undefined);
  }
}

export class TaskNotFoundError extends AppError {
  constructor(id: string, cause?: unknown) {
    super(404, ERROR_CODES.TASK_NOT_FOUND, `No existe una tarea con id ${id}.`,
      cause !== undefined ? { cause } : undefined);
  }
}

export class ProjectNameTakenError extends AppError {
  constructor(name: string, cause?: unknown) {
    super(409, ERROR_CODES.PROJECT_NAME_TAKEN, `Ya existe un proyecto llamado "${name}".`,
      cause !== undefined ? { cause } : undefined);
  }
}

export class ProjectHasTasksError extends AppError {
  constructor(cause?: unknown) {
    super(409, ERROR_CODES.PROJECT_HAS_TASKS,
      'No se puede eliminar un proyecto que todavía tiene tareas. Elimínalas primero.',
      cause !== undefined ? { cause } : undefined);
  }
}

/**
 * El límite de trabajo en curso está lleno.
 *
 * Es un 409 y no un 400: el payload es válido y la operación sería legal en
 * otro momento. Lo que impide moverla es el estado del tablero, igual que en
 * el 409 de borrar un proyecto con tareas.
 *
 * El mensaje dice el número y qué hacer, porque un límite alcanzado no es un
 * fallo del usuario sino la señal que el método kanban quiere producir:
 * termina algo antes de empezar otra cosa.
 */
export class WipLimitReachedError extends AppError {
  constructor(limite: number, cause?: unknown) {
    super(409, ERROR_CODES.WIP_LIMIT_REACHED,
      `El límite de trabajo en curso es de ${limite} ${limite === 1 ? 'tarea' : 'tareas'}. Termina o devuelve alguna antes de empezar otra.`,
      cause !== undefined ? { cause } : undefined);
  }
}

export class ColumnNotFoundError extends AppError {
  constructor(id: string, cause?: unknown) {
    super(404, ERROR_CODES.COLUMN_NOT_FOUND, `No existe una columna con id ${id} en este proyecto.`,
      cause !== undefined ? { cause } : undefined);
  }
}

/**
 * Borrar una columna con tareas dentro.
 *
 * Mismo criterio que `ProjectHasTasksError`: no hay borrado en cascada de
 * trabajo ajeno. El mensaje dice cuántas tareas hay y cuál es la salida, que
 * aquí sí existe —reasignarlas— porque la API la ofrece en la misma operación.
 */
export class ColumnHasTasksError extends AppError {
  constructor(tareas: number, cause?: unknown) {
    super(409, ERROR_CODES.COLUMN_HAS_TASKS,
      `Esta columna todavía tiene ${tareas} ${tareas === 1 ? 'tarea' : 'tareas'}. Indica a qué columna moverlas para poder eliminarla.`,
      cause !== undefined ? { cause } : undefined);
  }
}

export class ColumnNameTakenError extends AppError {
  constructor(name: string, cause?: unknown) {
    super(409, ERROR_CODES.COLUMN_NAME_TAKEN, `Este proyecto ya tiene una columna llamada "${name}".`,
      cause !== undefined ? { cause } : undefined);
  }
}

/**
 * Un tablero necesita al menos una columna de cada categoría para seguir
 * siendo un flujo: sin `TODO` no hay entrada, sin `IN_PROGRESS` no hay trabajo
 * en curso que limitar, y sin `DONE` no hay forma de terminar nada —ni de que
 * el trigger selle `completed_at`—.
 */
export class LastColumnOfCategoryError extends AppError {
  constructor(categoria: string, cause?: unknown) {
    super(409, ERROR_CODES.LAST_COLUMN_OF_CATEGORY,
      `Es la última columna de tipo "${categoria}" del proyecto. Crea otra equivalente antes de eliminarla.`,
      cause !== undefined ? { cause } : undefined);
  }
}

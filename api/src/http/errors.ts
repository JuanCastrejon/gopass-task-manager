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

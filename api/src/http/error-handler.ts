import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError, ERROR_CODES, ValidationError, type ErrorCode, type FieldIssue } from './errors.js';
import { translatePgError } from '../db/pg-error.js';

const PROBLEM_BASE = 'https://gopass-task-manager.local/errors';

interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: ErrorCode;
  detail?: string;
  instance: string;
  requestId: string;
  errors?: FieldIssue[];
}

const TITLES: Record<ErrorCode, string> = {
  VALIDATION_ERROR: 'Payload inválido',
  PROJECT_NOT_FOUND: 'Proyecto no encontrado',
  TASK_NOT_FOUND: 'Tarea no encontrada',
  PROJECT_NAME_TAKEN: 'Nombre de proyecto en uso',
  PROJECT_HAS_TASKS: 'El proyecto tiene tareas asociadas',
  ROUTE_NOT_FOUND: 'Ruta no encontrada',
  INTERNAL_ERROR: 'Error interno',
};

/** `PROJECT_HAS_TASKS` → `project-has-tasks` */
function slug(code: ErrorCode): string {
  return code.toLowerCase().replaceAll('_', '-');
}

function zodToIssues(err: ZodError): FieldIssue[] {
  return err.issues.map((i) => ({
    path: i.path.join('.') || 'body',
    message: i.message,
  }));
}

/**
 * Único punto donde un error se convierte en respuesta HTTP.
 *
 * Nada de lo que produce PostgreSQL llega crudo al cliente: `detail` puede
 * contener el contenido de la fila que falló ("Failing row contains (...)")
 * y `constraint` filtra el nombre interno del esquema. Ambos se registran en
 * el log del servidor, junto al `requestId`, y nunca se serializan.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  const appError = toAppError(err);

  if (appError.status >= 500) {
    console.error(`[error] requestId=${req.requestId} ${req.method} ${req.originalUrl}`, err);
  }

  const problem: ProblemDetails = {
    type: `${PROBLEM_BASE}/${slug(appError.code)}`,
    title: TITLES[appError.code],
    status: appError.status,
    code: appError.code,
    instance: req.originalUrl,
    requestId: req.requestId,
  };

  // Un 500 no explica su causa: el cliente no puede hacer nada con ella y
  // el mensaje interno puede filtrar detalles del esquema.
  if (appError.status < 500) problem.detail = appError.message;
  if (appError.issues) problem.errors = appError.issues;

  res.status(appError.status).type('application/problem+json').json(problem);
}

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) return new ValidationError(zodToIssues(err), err);

  const translated = translatePgError(err);
  if (translated) return translated;

  return new AppError(500, ERROR_CODES.INTERNAL_ERROR, 'Error interno.', { cause: err });
}

/** 404 uniforme para rutas inexistentes, en el mismo formato que el resto. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).type('application/problem+json').json({
    type: `${PROBLEM_BASE}/${slug(ERROR_CODES.ROUTE_NOT_FOUND)}`,
    title: TITLES[ERROR_CODES.ROUTE_NOT_FOUND],
    status: 404,
    code: ERROR_CODES.ROUTE_NOT_FOUND,
    detail: `No existe ${req.method} ${req.originalUrl}.`,
    instance: req.originalUrl,
    requestId: req.requestId,
  });
}

import { AppError, ERROR_CODES, ValidationError } from '../http/errors.js';

/**
 * Forma mínima del error del driver `pg` que este módulo necesita.
 * No se importa el tipo `DatabaseError` para no atar el resto del código
 * a la versión del driver.
 */
export interface PgError extends Error {
  code: string;
  constraint?: string;
  table?: string;
  detail?: string;
}

export function isPgError(err: unknown): err is PgError {
  return err instanceof Error && typeof (err as { code?: unknown }).code === 'string';
}

export function hasPgCode(err: unknown, code: string): boolean {
  return isPgError(err) && err.code === code;
}

/** Violación de la clave foránea de `tasks` hacia `projects`. */
export function isTaskProjectFkViolation(err: unknown): boolean {
  return isPgError(err) && err.code === '23503' && err.constraint === 'tasks_project_id_fkey';
}

/**
 * Traduce los errores de PostgreSQL que SÍ se pueden identificar sin conocer
 * la operación en curso.
 *
 * `23503` queda deliberadamente fuera. Se comprobó contra PostgreSQL 16 que
 * borrar un proyecto con tareas e insertar una tarea con `project_id`
 * inexistente producen exactamente los mismos `code`, `constraint`, `table` y
 * `schema`; solo difiere `detail`, que es texto en inglés generado por el
 * motor. Distinguirlos aquí exigiría parsear ese texto, así que la
 * desambiguación vive en cada repositorio, que sí sabe qué estaba haciendo.
 *
 * Devuelve `null` cuando el error no es reconocible: quien llama decide.
 */
export function translatePgError(err: unknown): AppError | null {
  if (!isPgError(err)) return null;

  switch (err.code) {
    case '23505':
      // Índice único funcional sobre lower(btrim(name)).
      if (err.constraint === 'projects_name_unique_ci') {
        return new AppError(409, ERROR_CODES.PROJECT_NAME_TAKEN,
          'Ya existe un proyecto con ese nombre.', { cause: err });
      }
      if (err.constraint === 'labels_project_name_unique_ci') {
        return new AppError(409, ERROR_CODES.LABEL_NAME_TAKEN,
          'Ya existe una etiqueta con ese nombre en este proyecto.', { cause: err });
      }
      return null;

    case '23514':
      // El CHECK es la última barrera; Zod debería haber rechazado antes.
      return new ValidationError(
        [{ path: constraintToField(err.constraint), message: checkMessage(err.constraint) }],
        err,
      );

    case '23502':
      return new ValidationError(
        [{ path: 'body', message: 'Falta un campo obligatorio.' }],
        err,
      );

    case '22P02':
      // UUID mal formado o valor fuera de un ENUM. Sin `constraint` ni
      // `table`: el motor solo expone `routine`.
      return new ValidationError(
        [{ path: 'body', message: 'Un valor tiene un formato o un tipo inválido.' }],
        err,
      );

    default:
      return null;
  }
}

function constraintToField(constraint: string | undefined): string {
  switch (constraint) {
    case 'projects_name_not_blank':
    case 'projects_name_max_len':
    case 'labels_name_not_blank':
    case 'labels_name_max_len':
      return 'name';
    case 'labels_color_check':
      return 'color';
    case 'tasks_title_not_blank':
    case 'tasks_title_max_len':
      return 'title';
    case 'tasks_done_completed_at':
      return 'status';
    default:
      return 'body';
  }
}

function checkMessage(constraint: string | undefined): string {
  switch (constraint) {
    case 'projects_name_not_blank':
      return 'El nombre no puede estar vacío.';
    case 'projects_name_max_len':
      return 'El nombre supera los 120 caracteres.';
    case 'labels_name_not_blank':
      return 'El nombre no puede estar vacío.';
    case 'labels_name_max_len':
      return 'El nombre supera los 50 caracteres.';
    case 'labels_color_check':
      return 'El color debe pertenecer a la paleta permitida.';
    case 'tasks_title_not_blank':
      return 'El título no puede estar vacío.';
    case 'tasks_title_max_len':
      return 'El título supera los 200 caracteres.';
    case 'tasks_done_completed_at':
      return 'Estado y fecha de completado son incoherentes.';
    default:
      return 'El valor no cumple una restricción de integridad.';
  }
}

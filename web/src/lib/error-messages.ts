import { ApiError } from './api-client.ts';

/**
 * Traducción de `code` a mensaje para el usuario.
 *
 * El `code` es el contrato estable con el servidor; `title` y `detail` son
 * texto para humanos que puede cambiar sin previo aviso. Por eso la interfaz
 * decide su propio mensaje a partir del `code` y solo cae en `detail` cuando
 * se encuentra un código que todavía no conoce: así una API más nueva que el
 * frontend sigue diciendo algo útil en vez de "error inesperado".
 */
const MESSAGES: Record<string, string> = {
  // Dice lo que el usuario puede hacer DESDE AQUÍ. La API sí admite
  // reasignar una tarea a otro proyecto (`PATCH /api/tasks/:id` con
  // `projectId`), pero la interfaz no expone todavía ese control: prometerlo
  // en el mensaje sería mandar al usuario a buscar un botón que no existe.
  PROJECT_HAS_TASKS:
    'Este proyecto todavía tiene tareas. Elimínalas antes de eliminar el proyecto.',
  // `WIP_LIMIT_REACHED` no está aquí a propósito, y no es un olvido. Su
  // `detail` incluye el límite concreto del proyecto —«el límite es de 3
  // tareas»—, y un mensaje fijo escrito aquí solo podría decirlo en genérico o
  // duplicar el cálculo. Es el caso que justifica que el respaldo a `detail`
  // exista.
  PROJECT_NAME_TAKEN: 'Ya existe un proyecto con ese nombre.',
  PROJECT_NOT_FOUND: 'Este proyecto ya no existe.',
  TASK_NOT_FOUND: 'Esta tarea ya no existe.',
  VALIDATION_ERROR: 'Revisa los datos del formulario.',
  ROUTE_NOT_FOUND: 'La dirección solicitada no existe.',
  INTERNAL_ERROR: 'El servidor tuvo un problema. Vuelve a intentarlo en un momento.',
};

export function messageFor(error: unknown, fallback = 'Algo no salió como esperábamos.'): string {
  if (!(error instanceof ApiError)) return fallback;
  // `status === 0` es el caso de servidor caído o sin red: no hay `problem`
  // que leer y decir "error del servidor" sería engañoso.
  if (error.status === 0) return 'No hay conexión con el servidor.';

  const conocido = MESSAGES[error.code] ?? error.problem?.detail;
  if (conocido) return conocido;

  // Un 5xx sin `code` reconocible viene de un proxy caído o de un fallo no
  // previsto: su cuerpo es HTML, no `problem+json`. Decir "algo no salió como
  // esperábamos" ahí es menos útil que decir la verdad.
  if (error.status >= 500) return 'El servidor no está disponible en este momento.';

  return fallback;
}

/** Errores por campo de un 400, para pintarlos junto a su input. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || !error.problem?.errors) return {};
  return Object.fromEntries(error.problem.errors.map((e) => [e.path, e.message]));
}

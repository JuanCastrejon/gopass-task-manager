import { z } from 'zod';

/**
 * La API es la frontera de confianza. Estos esquemas son lo único que separa
 * el payload del cliente de la capa de datos.
 *
 * `.trim()` no es cosmético: el índice único de la base es
 * `lower(btrim(name))`. Si aquí no se normalizara, `"  Telepeaje  "` pasaría
 * la validación y chocaría contra el índice como un 409 que el usuario no
 * entiende, en vez de guardarse como el mismo proyecto que ya escribió.
 */

export const projectIdParamsSchema = z.object({
  id: z.string().uuid('El identificador debe ser un UUID.'),
});

/**
 * Límite de trabajo en curso. `null` es «sin límite» y es un valor que el
 * cliente puede enviar a propósito para quitarlo; `0` se rechaza aquí y
 * también en la base, porque dejaría un tablero en el que no se puede empezar
 * nada. El techo de 100 evita que un dedo torpe escriba un número que ningún
 * equipo puede sostener y que, de hecho, equivale a no tener límite.
 */
const wipLimit = z
  .number()
  .int('El límite debe ser un número entero.')
  .min(1, 'El límite debe ser al menos 1.')
  .max(100, 'El límite no puede superar 100.');

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, 'El nombre no puede estar vacío.').max(120, 'El nombre supera los 120 caracteres.'),
  description: z.string().trim().max(2000).nullish(),
  wipLimit: wipLimit.nullish(),
});

export const patchProjectSchema = z
  .object({
    name: z.string().trim().min(1, 'El nombre no puede estar vacío.').max(120, 'El nombre supera los 120 caracteres.').optional(),
    // `nullable` a propósito: en PATCH, un campo ausente significa "no lo
    // toques" y un `null` explícito significa "bórralo". Sin esa distinción no
    // habría forma de quitar una descripción ya escrita.
    description: z.string().trim().max(2000).nullable().optional(),
    wipLimit: wipLimit.nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Envía al menos un campo para actualizar.',
  });

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type PatchProjectInput = z.infer<typeof patchProjectSchema>;

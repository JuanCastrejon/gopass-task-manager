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

export const PROJECT_BACKGROUNDS = [
  'neutro',
  'azul',
  'verde',
  'ambar',
  'purpura',
  'rosa',
] as const;

export type ProjectBackground = (typeof PROJECT_BACKGROUNDS)[number];

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, 'El nombre no puede estar vacío.').max(120, 'El nombre supera los 120 caracteres.'),
  description: z.string().trim().max(2000).nullish(),
  background: z
    .enum(PROJECT_BACKGROUNDS, {
      errorMap: () => ({
        message: 'El fondo debe ser uno de: neutro, azul, verde, ambar, purpura, rosa.',
      }),
    })
    .default('neutro'),
});

export const patchProjectSchema = z
  .object({
    name: z.string().trim().min(1, 'El nombre no puede estar vacío.').max(120, 'El nombre supera los 120 caracteres.').optional(),
    // `nullable` a propósito: en PATCH, un campo ausente significa "no lo
    // toques" y un `null` explícito significa "bórralo". Sin esa distinción no
    // habría forma de quitar una descripción ya escrita.
    description: z.string().trim().max(2000).nullable().optional(),
    background: z
      .enum(PROJECT_BACKGROUNDS, {
        errorMap: () => ({
          message: 'El fondo debe ser uno de: neutro, azul, verde, ambar, purpura, rosa.',
        }),
      })
      .optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Envía al menos un campo para actualizar.',
  });

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type PatchProjectInput = z.infer<typeof patchProjectSchema>;


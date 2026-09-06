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

/**
 * Plantillas de límite de trabajo en curso, aplicables **solo al crear**.
 *
 * Al crear un proyecto sus columnas todavía no existen —las pone el trigger
 * `projects_create_default_columns` justo después del `INSERT`—, así que pedir
 * un número por columna sería pedirlo para columnas que aún no tienen nombre.
 * La plantilla nombra una intención y el repositorio la traduce.
 *
 * `flujo_controlado` es un **valor por defecto de producto**, no una invariante
 * del dominio: quien lo reciba puede cambiarlo o quitarlo al momento desde la
 * edición del proyecto. Por eso lo aplica el repositorio y no el motor. Las
 * invariantes siguen donde estaban: el trigger garantiza que todo proyecto nace
 * con tablero, y los `CHECK` garantizan que un límite es válido y que una
 * columna terminal no admite ninguno.
 */
export const WIP_TEMPLATES = ['sin_limites', 'flujo_controlado'] as const;
export type WipTemplate = (typeof WIP_TEMPLATES)[number];

/**
 * El 2 no sale del dominio: no hay ninguna regla que lo derive. Es la
 * convención de producto que ya usaban los datos de ejemplo, y se fija aquí
 * —en un solo sitio, con nombre— para que cambiarla sea una decisión y no una
 * búsqueda por el código.
 */
export const LIMITE_FLUJO_CONTROLADO = 2;

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
  wipTemplate: z
    .enum(WIP_TEMPLATES, {
      errorMap: () => ({ message: 'La plantilla debe ser sin_limites o flujo_controlado.' }),
    })
    .default('sin_limites'),
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


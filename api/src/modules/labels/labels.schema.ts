import { z } from 'zod';

export const LABEL_COLORS = [
  'slate',
  'red',
  'orange',
  'amber',
  'yellow',
  'green',
  'teal',
  'cyan',
  'blue',
  'indigo',
  'purple',
  'pink',
] as const;

export type LabelColor = (typeof LABEL_COLORS)[number];

const strictMessage = 'Campo no reconocido o de solo lectura.';

export const labelIdParamsSchema = z.object({
  id: z.string().uuid('El identificador debe ser un UUID.'),
});

export const projectScopedParamsSchema = z.object({
  projectId: z.string().uuid('El identificador de proyecto debe ser un UUID.'),
});

export const createLabelSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'El nombre no puede estar vacío.')
      .max(50, 'El nombre supera los 50 caracteres.'),
    color: z.enum(LABEL_COLORS, {
      errorMap: () => ({ message: 'El color debe pertenecer a la paleta permitida.' }),
    }),
  })
  .strict(strictMessage);

export const patchLabelSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'El nombre no puede estar vacío.')
      .max(50, 'El nombre supera los 50 caracteres.')
      .optional(),
    color: z
      .enum(LABEL_COLORS, {
        errorMap: () => ({ message: 'El color debe pertenecer a la paleta permitida.' }),
      })
      .optional(),
  })
  .strict(strictMessage)
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Envía al menos un campo para actualizar.',
  });

export const deleteLabelQuerySchema = z.object({
  confirm: z
    .preprocess((val) => val === 'true' || val === true || val === '1', z.boolean())
    .optional(),
});

export const setTaskLabelsSchema = z
  .object({
    labelIds: z
      .array(z.string().uuid('El identificador de etiqueta debe ser un UUID.'))
      .transform((list) => [...new Set(list)]),
  })
  .strict(strictMessage);

export type CreateLabelInput = z.infer<typeof createLabelSchema>;
export type PatchLabelInput = z.infer<typeof patchLabelSchema>;
export type DeleteLabelQuery = z.infer<typeof deleteLabelQuerySchema>;
export type SetTaskLabelsInput = z.infer<typeof setTaskLabelsSchema>;

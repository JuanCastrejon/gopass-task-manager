import { z } from 'zod';
import { TASK_STATUSES } from '../tasks/tasks.schema.js';

/**
 * Criterios de orden de una columna.
 *
 * No se ofrece orden alfabético por título: no responde a ninguna decisión de
 * trabajo —nadie elige qué hacer a continuación por la letra inicial— y solo
 * añadiría relleno al selector. Los cuatro que quedan responden a preguntas
 * reales: qué tomar ahora, qué lleva más tiempo atascado, y qué acaba de
 * entrar o de salir.
 */
export const COLUMN_SORTS = ['priority_desc', 'priority_asc', 'created_desc', 'created_asc'] as const;
export type ColumnSort = (typeof COLUMN_SORTS)[number];

export const columnParamsSchema = z.object({
  projectId: z.string().uuid('El identificador de proyecto debe ser un UUID.'),
  columnId: z.string().uuid('El identificador de columna debe ser un UUID.'),
});

export const projectScopedColumnsSchema = z.object({
  projectId: z.string().uuid('El identificador de proyecto debe ser un UUID.'),
});

const name = z
  .string()
  .trim()
  .min(1, 'El nombre de la columna no puede estar vacío.')
  .max(60, 'El nombre de la columna supera los 60 caracteres.');

/**
 * El límite se valida igual que en el proyecto: `null` es «sin límite» y `0`
 * se rechaza, porque dejaría una columna en la que no se puede entrar. La base
 * lo impide además con un `CHECK`, por si alguien escribe por `psql`.
 */
const wipLimit = z
  .number()
  .int('El límite debe ser un número entero.')
  .min(1, 'El límite debe ser al menos 1.')
  .max(100, 'El límite no puede superar 100.');

export const createColumnSchema = z
  .object({
    name,
    /**
     * La categoría es obligatoria al crear y **no se puede cambiar después**.
     * Cambiarla exigiría mover a la vez el `status` de todas las tareas que
     * contiene, porque la clave foránea compuesta las mantiene unidas; y
     * hacerlo en silencio movería tareas de estado sin que nadie lo pidiera,
     * sellando o borrando fechas de completado por efecto colateral.
     */
    category: z.enum(TASK_STATUSES),
    wipLimit: wipLimit.nullish(),
    sort: z.enum(COLUMN_SORTS).optional(),
  })
  .strict('Campo no reconocido o de solo lectura.');

export const patchColumnSchema = z
  .object({
    name: name.optional(),
    wipLimit: wipLimit.nullable().optional(),
    sort: z.enum(COLUMN_SORTS).optional(),
    // `category` ausente a propósito: ver la nota de `createColumnSchema`.
    // `position` tampoco: se cambia con la ruta de reordenación, que mueve
    // todas las posiciones de una vez dentro de una transacción.
  })
  .strict('Campo no reconocido o de solo lectura.')
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Envía al menos un campo para actualizar.',
  });

/**
 * Reordenar es una operación sobre el conjunto, no sobre una columna suelta.
 * Se envía el orden completo y el servidor lo aplica en una transacción: así
 * no existe un estado intermedio con dos columnas en la misma posición ni hace
 * falta que el cliente calcule desplazamientos.
 */
export const reorderColumnsSchema = z
  .object({
    columnIds: z
      .array(z.string().uuid('Cada identificador debe ser un UUID.'))
      .min(1, 'Envía al menos una columna.'),
  })
  .strict('Campo no reconocido o de solo lectura.');

/**
 * Borrar una columna con tareas exige decir a dónde van. Sin destino, la API
 * responde 409 y explica cuántas hay, igual que al borrar un proyecto con
 * tareas (ADR-003): el borrado en cascada de trabajo ajeno no es una opción.
 */
export const deleteColumnQuerySchema = z.object({
  reassignTo: z.string().uuid('El identificador de la columna destino debe ser un UUID.').optional(),
});

export type CreateColumnInput = z.infer<typeof createColumnSchema>;
export type PatchColumnInput = z.infer<typeof patchColumnSchema>;
export type ReorderColumnsInput = z.infer<typeof reorderColumnsSchema>;
export type DeleteColumnQuery = z.infer<typeof deleteColumnQuerySchema>;

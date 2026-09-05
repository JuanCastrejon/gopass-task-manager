import { z } from 'zod';

/**
 * El entorno se valida al arrancar, no al primer uso.
 * Un proceso que arranca con una configuración incompleta y falla
 * en la primera petición es más difícil de diagnosticar que uno
 * que se niega a arrancar diciendo qué falta.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const detalle = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(raíz)'}: ${i.message}`)
    .join('\n');
  console.error(`Configuración de entorno inválida:\n${detalle}`);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;

import { createApp } from '../../src/app.js';

/**
 * Instancia única de la aplicación para las pruebas de integración.
 *
 * Se importa dinámicamente desde cada archivo de prueba, después de que el
 * `setupFile` haya apuntado `DATABASE_URL` a la base de este worker. Un import
 * estático desde el archivo de prueba arrastraría `pool.ts` antes de tiempo.
 */
export const app = createApp();

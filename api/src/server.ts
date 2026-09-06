import { createApp } from './app.js';
import { env } from './config/env.js';
import { closePool } from './db/pool.js';

const app = createApp();
const server = app.listen(env.API_PORT, () => {
  console.log(`[api] escuchando en :${env.API_PORT} (${env.NODE_ENV})`);
});

/**
 * Apagado ordenado: sin esto, `docker compose down` deja peticiones
 * a medias y conexiones colgadas en PostgreSQL.
 */
async function shutdown(signal: string): Promise<void> {
  console.log(`[api] ${signal} recibido, cerrando`);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closePool();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

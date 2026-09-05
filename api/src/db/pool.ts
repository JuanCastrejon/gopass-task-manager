import pg from 'pg';
import { env } from '../config/env.js';

/**
 * Un único pool para todo el proceso. Los repositorios reciben este pool
 * o un cliente de transacción; ninguno abre conexiones por su cuenta.
 */
export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('Error inesperado en un cliente inactivo del pool:', err.message);
});

/** Comprobación de vida usada por `GET /api/health` y por el healthcheck de Docker. */
export async function pingDatabase(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}

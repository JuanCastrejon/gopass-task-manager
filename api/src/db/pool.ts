import pg from 'pg';
import { env } from '../config/env.js';
/**
 * Parser de tipos para el driver `pg`:
 *
 * Por defecto `pg` convierte las columnas de tipo `DATE` (OID 1082) a objetos `Date`
 * de JavaScript a medianoche UTC. Al serializarse a JSON con `JSON.stringify`, ese
 * objeto se formatea como ISO string (ej. "2026-03-12T00:00:00.000Z"), lo que reintroduce
 * el componente horario. En clientes situados al oeste de UTC (ej. Bogotá, GMT-05:00),
 * esto provoca que entre las 19:00 y las 23:59 locales la fecha se desplace al día anterior.
 *
 * Configurar el parser 1082 como función identidad `(val) => val` garantiza que el valor
 * YYYY-MM-DD entregado por PostgreSQL viaje directamente como cadena pura en toda la API,
 * sin instanciar objetos Date intermedios ni depender de formateos manuales repetitivos
 * con `to_char` en cada consulta SQL.
 *
 * ADVERTENCIA DE ALCANCE: `pg.types.setTypeParser` es global a todo el proceso Node.js.
 * Afecta a cualquier columna de tipo `date` de cualquier tabla, presente o futura.
 * Hoy solo existe `tasks.due_date` en el esquema, por lo que no hay conflicto; cualquier
 * desarrollador que incorpore una nueva columna `date` en el futuro heredará este
 * comportamiento (cadena ISO `YYYY-MM-DD` sin objeto `Date`).
 */
pg.types.setTypeParser(1082, (val: string) => val);

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

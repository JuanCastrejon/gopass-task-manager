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
 * Resuelve la configuración de conexión del pool según el DESTINO de la base de datos.
 *
 * NOTA CRÍTICA DE ARQUITECTURA: `NODE_ENV === 'production'` NO decide si la base habla TLS.
 * `NODE_ENV=production` describe el modo de compilación y optimización de Node.js (activo
 * tanto en `docker-compose.yml` como en `api/Dockerfile`). El contenedor `db` local corre
 * un PostgreSQL estándar sin SSL; exigir TLS bajo `NODE_ENV=production` provoca el fallo
 * irrecuperable "The server does not support SSL connections" al levantar `docker compose up --build`.
 *
 * El criterio para activar TLS se apoya exclusivamente en propiedades del DESTINO:
 * 1. `APP_ENV === 'production'`, variable inyectada únicamente en el despliegue serverless de Vercel.
 * 2. Que la URL apunte a `supabase.com` o solicite explícitamente `sslmode` en sus query parameters.
 */
export function resolvePoolConfig(
  rawUrl: string = env.DATABASE_URL,
  appEnv: string | undefined = process.env.APP_ENV,
): pg.PoolConfig {
  let isRemoteTls = false;

  if (appEnv === 'production' || rawUrl.includes('supabase.com')) {
    isRemoteTls = true;
  } else {
    try {
      const parsed = new URL(rawUrl);
      const mode = parsed.searchParams.get('sslmode');
      if (mode && mode !== 'disable') {
        isRemoteTls = true;
      }
    } catch {
      // Si la URL no parsea vía WHATWG, no se activa TLS por defecto
    }
  }

  if (isRemoteTls) {
    try {
      const url = new URL(rawUrl);
      if (url.searchParams.get('sslmode') === 'require') {
        url.searchParams.set('sslmode', 'no-verify');
      }
      return {
        connectionString: url.toString(),
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
        ssl: { rejectUnauthorized: false },
      };
    } catch {
      return {
        connectionString: rawUrl,
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
        ssl: { rejectUnauthorized: false },
      };
    }
  }

  return {
    connectionString: rawUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  };
}

/**
 * Un único pool para todo el proceso. Los repositorios reciben este pool
 * o un cliente de transacción; ninguno abre conexiones por su cuenta.
 */
export const pool = new pg.Pool(resolvePoolConfig());

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

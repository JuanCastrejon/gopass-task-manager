import pg from 'pg';
import { runner } from 'node-pg-migrate';
import { beforeEach, afterAll } from 'vitest';

/**
 * Aislamiento de las pruebas de integración: una base de datos por worker de
 * Vitest, para conservar el paralelismo entre archivos sin que se pisen los
 * datos.
 *
 * Este archivo es un `setupFile`, no un `globalSetup`, y eso es deliberado.
 * `pool.ts` crea el pool **al importarse**, leyendo `env.DATABASE_URL`. Si el
 * entorno no apuntara ya a la base de este worker, la cadena de imports del
 * archivo de prueba habría instanciado el pool contra la base equivocada.
 *
 * Se comprobó que un `setupFile` se ejecuta ANTES de que se evalúen los
 * imports estáticos del archivo de prueba, así que basta con reescribir
 * `process.env.DATABASE_URL` aquí. No hacen falta imports dinámicos, ni
 * `vi.mock` con hoisting, ni inyectar el pool en `createApp()`.
 *
 * `globalSetup` no serviría: corre en otro proceso y no comparte memoria ni
 * entorno con los workers.
 */

const ADMIN_DB = 'postgres';

function replaceDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

/** `CREATE DATABASE` no admite `IF NOT EXISTS`; se trata el 42P04 como éxito. */
async function ensureDatabase(adminUrl: string, database: string): Promise<void> {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    // El nombre lo compone este archivo a partir del id del worker, nunca
    // viene de fuera; aun así se valida antes de interpolarlo, porque un
    // identificador no puede ir como parámetro de consulta.
    if (!/^[a-z0-9_]+$/.test(database)) {
      throw new Error(`Nombre de base de datos inválido: ${database}`);
    }
    await admin.query(`CREATE DATABASE ${database}`);
  } catch (err) {
    if ((err as { code?: string }).code !== '42P04') throw err; // duplicate_database
  } finally {
    await admin.end();
  }
}

const baseUrl =
  process.env['DATABASE_URL'] ?? 'postgres://gopass:gopass@localhost:5433/gopass_tasks';

// VITEST_POOL_ID identifica al worker. Es 1-based y existe también cuando
// Vitest corre con un solo hilo.
const workerId = process.env['VITEST_POOL_ID'] ?? '1';
const testDatabase = `gopass_tasks_test_${workerId}`;
const testUrl = replaceDatabase(baseUrl, testDatabase);

// Debe ocurrir antes de cualquier import de `src/`.
process.env['DATABASE_URL'] = testUrl;
process.env['NODE_ENV'] = 'test';

await ensureDatabase(replaceDatabase(baseUrl, ADMIN_DB), testDatabase);

// Las migraciones se aplican con la API programática, no invocando el binario:
// mismo proceso, mismo `DATABASE_URL`, y sin depender de que el CLI esté en el
// PATH del runner de CI. `node-pg-migrate` salta las ya aplicadas, así que
// repetirlo por worker es barato.
await runner({
  databaseUrl: testUrl,
  dir: 'migrations',
  direction: 'up',
  migrationsTable: 'pgmigrations',
  log: () => undefined,
});

// El pool se importa DESPUÉS de fijar el entorno, por eso es un import
// dinámico y no uno estático arriba del archivo.
const { pool, closePool } = await import('../../src/db/pool.js');

beforeEach(async () => {
  // Nombrar las tablas hace innecesario `CASCADE`: solo haría falta si una
  // tabla que referencia a `projects` quedara fuera de la lista. Ese comentario
  // resultó profético al añadir `project_columns`: PostgreSQL rechazó el
  // TRUNCATE con «cannot truncate a table referenced in a foreign key
  // constraint» hasta incluirla. Se prefiere seguir nombrándolas a poner
  // `CASCADE`, que borraría en silencio cualquier tabla futura que nadie haya
  // pensado en revisar.
  //
  // Y volvió a cumplirse con la `0009`: `labels` y `task_labels` referencian a
  // `projects` y a `tasks`, así que hubo que sumarlas aquí. Dos veces seguidas
  // es la razón para no cambiar esta lista por un `CASCADE` cómodo.
  //
  // `RESTART IDENTITY` tampoco: las claves primarias son uuid, no secuencias.
  await pool.query('TRUNCATE TABLE task_labels, labels, tasks, project_columns, projects');
});

afterAll(async () => {
  // Sin esto los sockets del driver mantienen vivo el event loop y el proceso
  // de Vitest queda colgado al terminar, en local y en CI.
  await closePool();
});

export { testUrl, testDatabase };

import { closePool, pool } from './pool.js';

/**
 * Datos de demostración.
 *
 * Vive fuera de las migraciones a propósito: es dato de demostración, no
 * esquema. Una migración de datos correría también en cualquier entorno real.
 *
 * Idempotente mediante UUIDs fijos y `ON CONFLICT (id) DO NOTHING`. Se usa la
 * clave primaria que ya existe en vez de inventar una restricción única sobre
 * `tasks.title`, que el dominio permite repetir. Y `DO NOTHING` en lugar de
 * `DO UPDATE` para que volver a sembrar no deshaga lo que alguien haya
 * cambiado desde la interfaz.
 *
 * Ninguna tarea declara `completed_at`: lo sella el trigger de la base. Es la
 * demostración de que la invariante no depende de que la aplicación acierte.
 */

const PROJECTS = [
  {
    id: '5b1f0a10-0000-4000-8000-000000000001',
    name: 'Telepeaje — integración de operadores',
    description: 'Conexión con concesionarios viales y homologación de lectores TAG.',
  },
  {
    id: '5b1f0a10-0000-4000-8000-000000000002',
    name: 'App de parqueaderos — flujo de pago',
    description: 'Entrada, salida y liquidación de tarifa desde la aplicación móvil.',
  },
  {
    id: '5b1f0a10-0000-4000-8000-000000000003',
    name: 'Conciliación de transacciones',
    description: 'Cuadre diario entre recaudo, pasarela y extracto bancario.',
  },
  {
    // Sin tareas a propósito: es el proyecto que demuestra el estado vacío
    // y el `progress: 0` de RF-02.
    id: '5b1f0a10-0000-4000-8000-000000000004',
    name: 'Migración de facturación electrónica',
    description: 'Aún sin planificar. Sirve para ver el estado vacío de la aplicación.',
  },
] as const;

const TASKS = [
  ['7c2e1b20-0000-4000-8000-000000000001', 0, 'Definir contrato de conciliación con el operador', 'IN_PROGRESS', 'HIGH'],
  ['7c2e1b20-0000-4000-8000-000000000002', 0, 'Homologar lectores TAG del corredor norte', 'TODO', 'HIGH'],
  ['7c2e1b20-0000-4000-8000-000000000003', 0, 'Documentar el protocolo de contingencia sin red', 'TODO', 'MEDIUM'],
  ['7c2e1b20-0000-4000-8000-000000000004', 0, 'Levantar el entorno de pruebas del operador', 'DONE', 'LOW'],
  ['7c2e1b20-0000-4000-8000-000000000005', 1, 'Diseñar la pantalla de liquidación de tarifa', 'IN_PROGRESS', 'MEDIUM'],
  ['7c2e1b20-0000-4000-8000-000000000006', 1, 'Integrar la pasarela de pagos en ambiente de pruebas', 'TODO', 'HIGH'],
  ['7c2e1b20-0000-4000-8000-000000000007', 1, 'Definir el manejo de salidas sin pago', 'TODO', 'MEDIUM'],
  ['7c2e1b20-0000-4000-8000-000000000008', 1, 'Aprobar el flujo con el equipo de operaciones', 'DONE', 'LOW'],
  ['7c2e1b20-0000-4000-8000-000000000009', 2, 'Automatizar la carga del extracto bancario', 'TODO', 'HIGH'],
  ['7c2e1b20-0000-4000-8000-00000000000a', 2, 'Definir la regla de tolerancia por diferencia de centavos', 'DONE', 'MEDIUM'],
  ['7c2e1b20-0000-4000-8000-00000000000b', 2, 'Reporte diario de partidas no conciliadas', 'DONE', 'LOW'],
] as const;

export async function runSeed(): Promise<{ projects: number; tasks: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let projects = 0;
    for (const p of PROJECTS) {
      const res = await client.query(
        `INSERT INTO projects (id, name, description)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO NOTHING`,
        [p.id, p.name, p.description],
      );
      projects += res.rowCount ?? 0;
    }

    let tasks = 0;
    for (const [id, projectIndex, title, status, priority] of TASKS) {
      const project = PROJECTS[projectIndex];
      if (!project) continue;
      const res = await client.query(
        `INSERT INTO tasks (id, project_id, title, status, priority)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [id, project.id, title, status, priority],
      );
      tasks += res.rowCount ?? 0;
    }

    await client.query('COMMIT');
    return { projects, tasks };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Ejecutado directamente por el entrypoint del contenedor y por `npm run seed`.
const isEntrypoint = process.argv[1]?.replaceAll('\\', '/').endsWith('/db/seed.js')
  || process.argv[1]?.replaceAll('\\', '/').endsWith('/db/seed.ts');

if (isEntrypoint) {
  try {
    const { projects, tasks } = await runSeed();
    console.log(`[seed] ${projects} proyecto(s) y ${tasks} tarea(s) nuevos`);
  } catch (err) {
    console.error('[seed] falló:', err);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

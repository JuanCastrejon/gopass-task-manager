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

const TASKS: readonly [
  id: string,
  projectIndex: number,
  title: string,
  status: 'TODO' | 'IN_PROGRESS' | 'DONE',
  priority: 'LOW' | 'MEDIUM' | 'HIGH',
  dueDaysOffset: number | null,
][] = [
  // Proyecto 0: Telepeaje
  // Vence pronto (dentro de los próximos 3 días naturales: mañana)
  ['7c2e1b20-0000-4000-8000-000000000001', 0, 'Definir contrato de conciliación con el operador', 'IN_PROGRESS', 'HIGH', 1],
  // Vencida (hace 2 días)
  ['7c2e1b20-0000-4000-8000-000000000002', 0, 'Homologar lectores TAG del corredor norte', 'TODO', 'HIGH', -2],
  // Con tiempo (en 10 días)
  ['7c2e1b20-0000-4000-8000-000000000003', 0, 'Documentar el protocolo de contingencia sin red', 'TODO', 'MEDIUM', 10],
  // Sin fecha
  ['7c2e1b20-0000-4000-8000-000000000004', 0, 'Levantar el entorno de pruebas del operador', 'DONE', 'LOW', null],
  // Proyecto 1: App de parqueaderos
  ['7c2e1b20-0000-4000-8000-000000000005', 1, 'Diseñar la pantalla de liquidación de tarifa', 'IN_PROGRESS', 'MEDIUM', 2],
  ['7c2e1b20-0000-4000-8000-000000000006', 1, 'Integrar la pasarela de pagos en ambiente de pruebas', 'TODO', 'HIGH', null],
  ['7c2e1b20-0000-4000-8000-000000000007', 1, 'Definir el manejo de salidas sin pago', 'TODO', 'MEDIUM', null],
  ['7c2e1b20-0000-4000-8000-000000000008', 1, 'Aprobar el flujo con el equipo de operaciones', 'DONE', 'LOW', null],
  // Proyecto 2: Conciliación de transacciones
  ['7c2e1b20-0000-4000-8000-000000000009', 2, 'Automatizar la carga del extracto bancario', 'TODO', 'HIGH', null],
  ['7c2e1b20-0000-4000-8000-00000000000a', 2, 'Definir la regla de tolerancia por diferencia de centavos', 'DONE', 'MEDIUM', null],
  ['7c2e1b20-0000-4000-8000-00000000000b', 2, 'Reporte diario de partidas no conciliadas', 'DONE', 'LOW', null],
];

const LABELS: readonly [id: string, projectIndex: number, name: string, color: string][] = [
  ['9a3b0001-0000-4000-8000-000000000001', 0, 'Backend', 'blue'],
  ['9a3b0001-0000-4000-8000-000000000002', 0, 'Urgente', 'red'],
  ['9a3b0001-0000-4000-8000-000000000003', 0, 'Seguridad', 'amber'],
  ['9a3b0001-0000-4000-8000-000000000004', 0, 'Infraestructura', 'teal'],
];

const TASK_LABELS: readonly [taskId: string, labelId: string, projectIndex: number][] = [
  // Tarea 1: 3 etiquetas para mostrar píldoras y el indicador accesible «+N» (+1)
  ['7c2e1b20-0000-4000-8000-000000000001', '9a3b0001-0000-4000-8000-000000000001', 0],
  ['7c2e1b20-0000-4000-8000-000000000001', '9a3b0001-0000-4000-8000-000000000002', 0],
  ['7c2e1b20-0000-4000-8000-000000000001', '9a3b0001-0000-4000-8000-000000000003', 0],
  // Tarea 2: 2 etiquetas (se ven ambas píldoras sin +N)
  ['7c2e1b20-0000-4000-8000-000000000002', '9a3b0001-0000-4000-8000-000000000001', 0],
  ['7c2e1b20-0000-4000-8000-000000000002', '9a3b0001-0000-4000-8000-000000000004', 0],
  // Tarea 3: 1 etiqueta
  ['7c2e1b20-0000-4000-8000-000000000003', '9a3b0001-0000-4000-8000-000000000002', 0],
  // Tarea 4: 0 etiquetas (permanece sin etiquetar)
];

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
    for (const [id, projectIndex, title, status, priority, dueDaysOffset] of TASKS) {
      const project = PROJECTS[projectIndex];
      if (!project) continue;
      const res = await client.query(
        `INSERT INTO tasks (id, project_id, title, status, priority, due_date)
         VALUES (
           $1, $2, $3, $4, $5,
           CASE
             WHEN $6::int IS NOT NULL THEN (CURRENT_DATE + ($6 * INTERVAL '1 day'))::date
             ELSE NULL
           END
         )
         ON CONFLICT (id) DO NOTHING`,
        [id, project.id, title, status, priority, dueDaysOffset],
      );
      tasks += res.rowCount ?? 0;
    }

    for (const [id, projectIndex, name, color] of LABELS) {
      const project = PROJECTS[projectIndex];
      if (!project) continue;
      await client.query(
        `INSERT INTO labels (id, project_id, name, color)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING`,
        [id, project.id, name, color],
      );
    }

    for (const [taskId, labelId, projectIndex] of TASK_LABELS) {
      const project = PROJECTS[projectIndex];
      if (!project) continue;
      await client.query(
        `INSERT INTO task_labels (task_id, label_id, project_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (task_id, label_id) DO NOTHING`,
        [taskId, labelId, project.id],
      );
    }

    /**
     * Un tablero de ejemplo que no sea el de por defecto.
     *
     * Sin esto, las columnas configurables y el límite de trabajo en curso solo
     * se verían si alguien los configura, y RF-16 pide que la aplicación abra
     * mostrando lo que sabe hacer. Se aplica solo al primer proyecto: los otros
     * tres conservan el tablero de tres columnas, que es el caso habitual.
     *
     * Con `WHERE NOT EXISTS` y no con `ON CONFLICT`: el índice de posición es
     * `DEFERRABLE` —lo necesita el reordenamiento, que intercambia posiciones
     * dentro de una transacción— y PostgreSQL no admite un índice diferible
     * como árbitro de `ON CONFLICT`. La guarda explícita consigue lo mismo:
     * sembrar dos veces no duplica la columna ni revierte lo que alguien haya
     * cambiado desde la interfaz.
     */
    const [primero] = PROJECTS;
    if (primero) {
      await client.query(
        `INSERT INTO project_columns (project_id, name, category, position, wip_limit)
         SELECT $1, 'En revisión', 'IN_PROGRESS', 4, 2
          WHERE NOT EXISTS (
            SELECT 1 FROM project_columns
             WHERE project_id = $1 AND lower(btrim(name)) = 'en revisión'
          )`,
        [primero.id],
      );
      // «En curso» con límite 2 y una sola tarea dentro: se ve el contador
      // «1/2» sin estar bloqueado, y basta mover una más para ver el 409.
      await client.query(
        `UPDATE project_columns SET wip_limit = 2
          WHERE project_id = $1 AND category = 'IN_PROGRESS' AND position = 2
            AND wip_limit IS NULL`,
        [primero.id],
      );
      // Y un orden distinto en la cola de entrada, para que el selector no
      // parezca decorativo: lo más antiguo primero delata lo que lleva ahí
      // demasiado tiempo (SL-14), mientras que el resto de columnas quedan en
      // 'manual' para demostrar la reordenación por arrastre (SL-15).
      await client.query(
        `UPDATE project_columns SET sort = 'created_asc'
          WHERE project_id = $1 AND category = 'TODO'`,
        [primero.id],
      );
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

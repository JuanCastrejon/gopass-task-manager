import { beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';

/**
 * RF-16 — la aplicación abre con datos.
 *
 * El seed es el único camino de escritura que corre solo, sin que nadie lo
 * pida desde HTTP, así que su invariante se prueba aquí y no a través de la
 * API: sembrar dos veces no puede duplicar filas ni deshacer lo que alguien
 * haya cambiado desde la interfaz.
 */

let pool: Pool;
let runSeed: () => Promise<{ projects: number; tasks: number }>;

beforeAll(async () => {
  ({ pool } = await import('../../src/db/pool.js'));
  ({ runSeed } = await import('../../src/db/seed.js'));
});

async function contar(): Promise<{ projects: number; tasks: number }> {
  const { rows } = await pool.query<{ projects: string; tasks: string }>(
    'SELECT (SELECT count(*) FROM projects) AS projects, (SELECT count(*) FROM tasks) AS tasks',
  );
  const row = rows[0] as { projects: string; tasks: string };
  return { projects: Number(row.projects), tasks: Number(row.tasks) };
}

describe('seed de datos de demostración (RF-16)', () => {
  it('deja la aplicación con datos de negocio, no en pantalla vacía', async () => {
    const insertado = await runSeed();

    expect(insertado).toEqual({ projects: 4, tasks: 11 });
    expect(await contar()).toEqual({ projects: 4, tasks: 11 });
  });

  it('sembrar dos veces no duplica nada', async () => {
    await runSeed();
    const segunda = await runSeed();

    // La segunda pasada no inserta: `ON CONFLICT (id) DO NOTHING`.
    expect(segunda).toEqual({ projects: 0, tasks: 0 });
    expect(await contar()).toEqual({ projects: 4, tasks: 11 });
  });

  it('no revierte lo que alguien haya cambiado desde la interfaz', async () => {
    await runSeed();
    await pool.query(`UPDATE projects SET name = 'Renombrado a mano' WHERE id = $1`, [
      '5b1f0a10-0000-4000-8000-000000000001',
    ]);

    await runSeed();

    const { rows } = await pool.query<{ name: string }>('SELECT name FROM projects WHERE id = $1', [
      '5b1f0a10-0000-4000-8000-000000000001',
    ]);
    // `DO NOTHING` y no `DO UPDATE`: el seed es un punto de partida, no una
    // migración de datos que imponga su versión en cada arranque.
    expect(rows[0]?.name).toBe('Renombrado a mano');
  });

  it('ninguna tarea nace con fecha de completado escrita por el seed', async () => {
    await runSeed();

    const { rows } = await pool.query<{ status: string; completed_at: Date | null }>(
      'SELECT status, completed_at FROM tasks',
    );
    // El seed no declara `completed_at`: lo sella el trigger. Es la prueba de
    // que la invariante no depende de que quien escribe acierte.
    for (const t of rows) {
      if (t.status === 'DONE') expect(t.completed_at).not.toBeNull();
      else expect(t.completed_at).toBeNull();
    }
  });

  it('la demo incluye al menos una columna con orden automático y al menos una con manual', async () => {
    await runSeed();

    const { rows } = await pool.query<{ sort: string }>(
      'SELECT sort FROM project_columns',
    );
    const automaticas = rows.filter((r) => r.sort !== 'manual');
    const manuales = rows.filter((r) => r.sort === 'manual');

    expect(automaticas.length).toBeGreaterThan(0);
    expect(manuales.length).toBeGreaterThan(0);
  });
});

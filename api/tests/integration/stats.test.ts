import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { Pool } from 'pg';

let app: Express;
let pool: Pool;

beforeAll(async () => {
  ({ app } = await import('../helpers/app.js'));
  ({ pool } = await import('../../src/db/pool.js'));
});

async function sembrar(): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO projects (name) VALUES ('Uno'), ('Dos') RETURNING id`,
  );
  const [a, b] = rows as [{ id: string }, { id: string }];
  await pool.query(
    `INSERT INTO tasks (project_id, title, status, priority) VALUES
       ($1,'a','DONE','HIGH'),
       ($1,'b','DONE','LOW'),
       ($1,'c','TODO','HIGH'),
       ($2,'d','IN_PROGRESS','MEDIUM')`,
    [a.id, b.id],
  );
}

describe('GET /api/stats', () => {
  it('sin datos devuelve ceros, no null ni claves ausentes', async () => {
    const res = await request(app).get('/api/stats');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ projects: 0, tasks: 0, done: 0, progress: 0 });
    // La clave existe aunque no haya ninguna tarea en ese estado: el
    // consumidor no tiene que conocerse el dominio ni defenderse con `?? 0`.
    expect(res.body.byStatus).toEqual({ TODO: 0, IN_PROGRESS: 0, DONE: 0 });
    expect(res.body.byPriority).toEqual({ LOW: 0, MEDIUM: 0, HIGH: 0 });
  });

  it('agrega los totales de todos los proyectos', async () => {
    await sembrar();
    const res = await request(app).get('/api/stats');

    expect(res.body).toMatchObject({ projects: 2, tasks: 4, done: 2, progress: 50 });
  });

  it('reparte por estado y por prioridad', async () => {
    await sembrar();
    const res = await request(app).get('/api/stats');

    expect(res.body.byStatus).toEqual({ TODO: 1, IN_PROGRESS: 1, DONE: 2 });
    expect(res.body.byPriority).toEqual({ LOW: 1, MEDIUM: 1, HIGH: 2 });
  });

  it('devuelve números, no los bigint como string que entrega el driver', async () => {
    await sembrar();
    const res = await request(app).get('/api/stats');

    expect(typeof res.body.tasks).toBe('number');
    expect(typeof res.body.progress).toBe('number');
    expect(typeof res.body.byStatus.DONE).toBe('number');
  });
});

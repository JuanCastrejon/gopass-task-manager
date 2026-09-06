import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';

/**
 * Integración contra PostgreSQL real, no contra un doble del driver.
 *
 * Es lo que da más señal por hora escrita: una sola prueba ejercita el
 * middleware, el esquema Zod, la ruta, el repositorio, el SQL parametrizado y
 * las restricciones del motor. Simular `pg` probaría el simulador.
 *
 * Los datos los crea cada prueba: `tests/setup/test-db.ts` trunca las tablas
 * antes de cada caso, así que nada depende del seed de Docker ni del orden.
 */

let app: Express;

beforeAll(async () => {
  // Import dinámico: el setup ya reescribió DATABASE_URL hacia la base de
  // este worker antes de que se evalúe nada de `src/`.
  ({ app } = await import('../helpers/app.js'));
});

async function crearProyecto(body: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/projects')
    .send({ name: `Proyecto ${crypto.randomUUID()}`, ...body });
}

describe('POST /api/projects', () => {
  it('crea el proyecto y devuelve 201 con el recurso', async () => {
    const res = await request(app)
      .post('/api/projects')
      .send({ name: 'Telepeaje', description: 'Integración de operadores' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Telepeaje', description: 'Integración de operadores' });
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof res.body.createdAt).toBe('string');
  });

  it('acepta un proyecto sin descripción y la devuelve como null', async () => {
    const res = await request(app).post('/api/projects').send({ name: 'Sin descripción' });
    expect(res.status).toBe(201);
    expect(res.body.description).toBeNull();
  });

  it('rechaza un nombre en blanco con 400 y señala el campo', async () => {
    const res = await request(app).post('/api/projects').send({ name: '   ' });

    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.errors?.[0]?.path).toBe('name');
  });

  it('rechaza un nombre de más de 120 caracteres', async () => {
    const res = await request(app).post('/api/projects').send({ name: 'x'.repeat(121) });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('normaliza los espacios del nombre antes de guardarlo', async () => {
    const res = await request(app).post('/api/projects').send({ name: '  Conciliación  ' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Conciliación');
  });

  it('devuelve 409 ante un nombre duplicado ignorando mayúsculas y espacios', async () => {
    await request(app).post('/api/projects').send({ name: 'Parqueaderos' });
    const res = await request(app).post('/api/projects').send({ name: '  parqueaderos ' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PROJECT_NAME_TAKEN');
  });

  it("asigna fondo 'neutro' por defecto si no se especifica", async () => {
    const res = await request(app).post('/api/projects').send({ name: 'Fondo defecto' });
    expect(res.status).toBe(201);
    expect(res.body.background).toBe('neutro');
  });

  it('crea el proyecto con un fondo de la paleta cerrada', async () => {
    const res = await request(app)
      .post('/api/projects')
      .send({ name: 'Fondo azul', background: 'azul' });
    expect(res.status).toBe(201);
    expect(res.body.background).toBe('azul');
  });

  it('rechaza un fondo no perteneciente a la paleta con 400 y mensaje en español', async () => {
    const res = await request(app)
      .post('/api/projects')
      .send({ name: 'Invalido', background: 'fosforito' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.errors?.[0]?.path).toBe('background');
    expect(res.body.errors?.[0]?.message).toContain(
      'El fondo debe ser uno de: neutro, azul, verde, ambar, purpura, rosa.',
    );
  });
});

describe('GET /api/projects', () => {
  it('devuelve lista vacía cuando no hay nada', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('un proyecto sin tareas trae progreso 0, no null ni 1', async () => {
    await crearProyecto({ name: 'Vacío' });
    const res = await request(app).get('/api/projects');

    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ taskCount: 0, doneCount: 0, progress: 0 });
  });

  it('calcula el progreso a partir de las tareas completadas', async () => {
    const { body: proyecto } = await crearProyecto({ name: 'Con tareas' });
    const { pool } = await import('../../src/db/pool.js');
    await pool.query(
      `INSERT INTO tasks (project_id, title, status) VALUES
         ($1,'a','DONE'), ($1,'b','DONE'), ($1,'c','TODO'), ($1,'d','IN_PROGRESS')`,
      [proyecto.id],
    );

    const res = await request(app).get('/api/projects');
    expect(res.body[0]).toMatchObject({ taskCount: 4, doneCount: 2, progress: 50 });
  });

  it('devuelve los contadores como números, no como strings', async () => {
    await crearProyecto();
    const res = await request(app).get('/api/projects');
    expect(typeof res.body[0].taskCount).toBe('number');
    expect(typeof res.body[0].progress).toBe('number');
  });

  it('desglosa las tareas por prioridad, con las tres claves siempre presentes', async () => {
    const { body: proyecto } = await crearProyecto({ name: 'Con prioridades' });
    const { pool } = await import('../../src/db/pool.js');
    await pool.query(
      `INSERT INTO tasks (project_id, title, priority) VALUES
         ($1,'a','HIGH'), ($1,'b','HIGH'), ($1,'c','LOW')`,
      [proyecto.id],
    );

    const res = await request(app).get('/api/projects');

    // `MEDIUM` en 0 y no ausente: el cliente filtra con `byPriority[p] > 0` y
    // una clave que falta lo obligaría a defenderse con `?? 0`.
    expect(res.body[0].byPriority).toEqual({ LOW: 1, MEDIUM: 0, HIGH: 2 });
  });

  it('un proyecto sin tareas trae las tres prioridades en 0, no en null', async () => {
    await crearProyecto({ name: 'Vacío' });
    const res = await request(app).get('/api/projects');

    // El `LEFT JOIN` deja los agregados en NULL cuando no hay tareas; sin el
    // COALESCE llegarían como null y `null > 0` sería false por accidente y
    // no por diseño.
    expect(res.body[0].byPriority).toEqual({ LOW: 0, MEDIUM: 0, HIGH: 0 });
    expect(typeof res.body[0].byPriority.HIGH).toBe('number');
  });
});

describe('GET /api/projects/:id', () => {
  it('devuelve el proyecto con su resumen', async () => {
    const { body: creado } = await crearProyecto({ name: 'Detalle' });
    const res = await request(app).get(`/api/projects/${creado.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: creado.id, name: 'Detalle', taskCount: 0 });
  });

  it('el detalle trae el mismo desglose por prioridad que el listado', async () => {
    const { body: creado } = await crearProyecto({ name: 'Detalle con prioridades' });
    const { pool } = await import('../../src/db/pool.js');
    await pool.query(
      `INSERT INTO tasks (project_id, title, priority) VALUES ($1,'a','MEDIUM')`,
      [creado.id],
    );

    // Listado y detalle comparten `SUMMARY_QUERY`. Esta prueba es la que
    // avisaría si alguien añadiera una columna solo a una de las dos rutas.
    const [listado, detalle] = await Promise.all([
      request(app).get('/api/projects'),
      request(app).get(`/api/projects/${creado.id}`),
    ]);

    expect(detalle.body.byPriority).toEqual({ LOW: 0, MEDIUM: 1, HIGH: 0 });
    expect(detalle.body.byPriority).toEqual(listado.body[0].byPriority);
  });

  it('404 con un uuid válido que no existe', async () => {
    const res = await request(app).get('/api/projects/00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PROJECT_NOT_FOUND');
  });

  it('400 —no 500— con un id que no es un uuid', async () => {
    const res = await request(app).get('/api/projects/no-soy-un-uuid');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('PATCH /api/projects/:id', () => {
  it('actualiza solo el campo enviado y deja el otro intacto', async () => {
    const { body: creado } = await crearProyecto({ name: 'Antes', description: 'se queda' });
    const res = await request(app).patch(`/api/projects/${creado.id}`).send({ name: 'Después' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Después', description: 'se queda' });
  });

  it('un null explícito borra la descripción', async () => {
    const { body: creado } = await crearProyecto({ description: 'a borrar' });
    const res = await request(app)
      .patch(`/api/projects/${creado.id}`)
      .send({ description: null });

    expect(res.status).toBe(200);
    expect(res.body.description).toBeNull();
  });

  it('mueve updated_at pero no created_at', async () => {
    const { body: creado } = await crearProyecto();
    const res = await request(app).patch(`/api/projects/${creado.id}`).send({ name: 'Renombrado' });

    expect(res.body.createdAt).toBe(creado.createdAt);
    expect(new Date(res.body.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(creado.updatedAt).getTime(),
    );
  });

  it('400 con el body vacío', async () => {
    const { body: creado } = await crearProyecto();
    const res = await request(app).patch(`/api/projects/${creado.id}`).send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('404 sobre un proyecto inexistente', async () => {
    const res = await request(app)
      .patch('/api/projects/00000000-0000-4000-8000-000000000000')
      .send({ name: 'Da igual' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PROJECT_NOT_FOUND');
  });

  it('409 si el nombre nuevo choca con otro proyecto', async () => {
    await crearProyecto({ name: 'Ocupado' });
    const { body: otro } = await crearProyecto({ name: 'Libre' });
    const res = await request(app).patch(`/api/projects/${otro.id}`).send({ name: 'ocupado' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PROJECT_NAME_TAKEN');
  });

  it('actualiza el fondo del proyecto a otro valor de la paleta', async () => {
    const { body: creado } = await crearProyecto();
    const res = await request(app)
      .patch(`/api/projects/${creado.id}`)
      .send({ background: 'verde' });

    expect(res.status).toBe(200);
    expect(res.body.background).toBe('verde');

    const detalle = await request(app).get(`/api/projects/${creado.id}`);
    expect(detalle.body.background).toBe('verde');
  });

  it('rechaza actualizar el fondo con un valor fuera de la paleta con 400', async () => {
    const { body: creado } = await crearProyecto();
    const res = await request(app)
      .patch(`/api/projects/${creado.id}`)
      .send({ background: 'magenta' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.errors?.[0]?.path).toBe('background');
    expect(res.body.errors?.[0]?.message).toContain(
      'El fondo debe ser uno de: neutro, azul, verde, ambar, purpura, rosa.',
    );
  });
});

describe('CHECK projects_background_check (SL-19 paso 3)', () => {
  it('el CHECK del motor rechaza un UPDATE directo con un fondo fuera de la paleta', async () => {
    const { body: creado } = await crearProyecto();
    const { pool } = await import('../../src/db/pool.js');

    await expect(
      pool.query('UPDATE projects SET background = $1 WHERE id = $2', [
        'radiactivo',
        creado.id,
      ]),
    ).rejects.toThrow(/projects_background_check/);
  });
});

describe('DELETE /api/projects/:id — la decisión de diseño del proyecto', () => {
  it('204 y sin cuerpo cuando el proyecto no tiene tareas', async () => {
    const { body: creado } = await crearProyecto();
    const res = await request(app).delete(`/api/projects/${creado.id}`);

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect((await request(app).get(`/api/projects/${creado.id}`)).status).toBe(404);
  });

  it('409 PROJECT_HAS_TASKS cuando tiene tareas, y el proyecto sigue ahí', async () => {
    const { body: creado } = await crearProyecto();
    const { pool } = await import('../../src/db/pool.js');
    await pool.query(`INSERT INTO tasks (project_id, title) VALUES ($1, 'bloquea el borrado')`, [
      creado.id,
    ]);

    const res = await request(app).delete(`/api/projects/${creado.id}`);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PROJECT_HAS_TASKS');
    // El 409 no destruyó nada: es la diferencia con una cascada.
    expect((await request(app).get(`/api/projects/${creado.id}`)).status).toBe(200);
  });

  it('las etiquetas se van con el proyecto: sin tareas, el borrado es 204 y no 500', async () => {
    // Regresión de SL-18. La migración 0009 declaró `labels.project_id` con
    // ON DELETE RESTRICT, copiando lo que hace `tasks`. Un proyecto con una
    // etiqueta y ninguna tarea devolvía 500, porque el traductor de errores
    // solo reconoce el 23503 de `tasks_project_id_fkey` y esta era otra
    // foránea distinta. La 0010 lo corrige pasándola a CASCADE: una etiqueta
    // es configuración del proyecto, como una columna, no contenido a
    // proteger. Lo protegido siguen siendo las tareas.
    const { body: creado } = await crearProyecto();
    const { pool } = await import('../../src/db/pool.js');
    await pool.query(`INSERT INTO labels (project_id, name, color) VALUES ($1, 'Urgente', 'red')`, [
      creado.id,
    ]);

    const res = await request(app).delete(`/api/projects/${creado.id}`);

    expect(res.status).toBe(204);
    expect((await request(app).get(`/api/projects/${creado.id}`)).status).toBe(404);

    // Y la etiqueta se fue con él, sin dejar filas huérfanas.
    const huerfanas = await pool.query('SELECT count(*)::int AS n FROM labels WHERE project_id = $1', [
      creado.id,
    ]);
    expect(huerfanas.rows[0].n).toBe(0);
  });

  it('404 —y no 409— cuando el proyecto ni siquiera existe', async () => {
    const res = await request(app).delete('/api/projects/00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PROJECT_NOT_FOUND');
  });
});

describe('contrato de errores', () => {
  it('ninguna respuesta de error filtra lo que dijo PostgreSQL', async () => {
    await crearProyecto({ name: 'Único' });
    const res = await request(app).post('/api/projects').send({ name: 'único' });

    const cuerpo = JSON.stringify(res.body);
    expect(cuerpo).not.toContain('projects_name_unique_ci');
    expect(cuerpo).not.toContain('Key (');
    expect(cuerpo).not.toContain('duplicate key');
    expect(res.body.stack).toBeUndefined();
  });

  it('toda respuesta lleva requestId, también las correctas', async () => {
    const ok = await request(app).get('/api/projects');
    const error = await request(app).get('/api/projects/no-uuid');

    expect(ok.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(error.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(error.body.requestId).toBe(error.headers['x-request-id']);
  });

  it('una ruta inexistente responde en el mismo formato que el resto', async () => {
    const res = await request(app).get('/api/no-existe');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body.code).toBe('ROUTE_NOT_FOUND');
  });
});

import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';

/**
 * Columnas configurables.
 *
 * Lo que se prueba aquí no es un CRUD más: es que las cuatro garantías que
 * antes daba el `ENUM` sigan en pie cuando las columnas dejan de ser tres y
 * fijas. Por eso todo va contra PostgreSQL real —la clave foránea compuesta,
 * los triggers y las restricciones son el sujeto de la prueba, no un detalle
 * de infraestructura que se pudiera simular—.
 */

let app: Express;
let projectId: string;

beforeAll(async () => {
  ({ app } = await import('../helpers/app.js'));
});

beforeEach(async () => {
  const { body } = await request(app).post('/api/projects').send({ name: 'Proyecto de prueba' });
  projectId = body.id as string;
});

interface Columna {
  id: string;
  name: string;
  category: string;
  position: number;
  wipLimit: number | null;
  sort: string;
  taskCount: number;
}

const listar = async (): Promise<Columna[]> =>
  (await request(app).get(`/api/projects/${projectId}/columns`)).body as Columna[];

const de = (columnas: Columna[], categoria: string): Columna =>
  columnas.find((c) => c.category === categoria)!;

const crearTarea = (body: Record<string, unknown> = {}) =>
  request(app).post(`/api/projects/${projectId}/tasks`).send({ title: 'Una tarea', ...body });

describe('el tablero inicial', () => {
  it('todo proyecto nace con tres columnas, una por categoría', async () => {
    const columnas = await listar();

    expect(columnas.map((c) => c.name)).toEqual(['Por hacer', 'En curso', 'Completada']);
    expect(columnas.map((c) => c.category)).toEqual(['TODO', 'IN_PROGRESS', 'DONE']);
    expect(columnas.map((c) => c.position)).toEqual([1, 2, 3]);
    expect(columnas.map((c) => c.sort)).toEqual(['manual', 'manual', 'manual']);
  });

  it('las crea el motor, no el servicio: un INSERT directo también las obtiene', async () => {
    const { pool } = await import('../../src/db/pool.js');
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO projects (name) VALUES ('Creado por SQL directo') RETURNING id`,
    );
    const { rows: columnas } = await pool.query(
      'SELECT category FROM project_columns WHERE project_id = $1 ORDER BY position',
      [rows[0]!.id],
    );
    // Es el mismo criterio que sella `completed_at` desde un trigger: una regla
    // que solo viviera en el servicio dejaría fuera al seed y a `psql`.
    expect(columnas.map((c) => (c as { category: string }).category)).toEqual([
      'TODO',
      'IN_PROGRESS',
      'DONE',
    ]);
  });

  it('devuelve 404 al pedir las columnas de un proyecto que no existe', async () => {
    const res = await request(app).get(
      '/api/projects/00000000-0000-4000-8000-000000000000/columns',
    );
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PROJECT_NOT_FOUND');
  });
});

describe('crear columnas', () => {
  it('añade una columna al final y la devuelve con su posición', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/columns`)
      .send({ name: 'En revisión', category: 'IN_PROGRESS' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'En revisión', category: 'IN_PROGRESS', position: 4, sort: 'manual' });
  });

  it('admite dos columnas con la misma categoría', async () => {
    // Es el punto del modelo: «En revisión» y «QA» son ambas trabajo en curso,
    // y el tablero puede distinguirlas sin que el dominio pierda su semántica.
    for (const name of ['En revisión', 'QA']) {
      expect((await request(app).post(`/api/projects/${projectId}/columns`).send({ name, category: 'IN_PROGRESS' })).status).toBe(201);
    }
    const enCurso = (await listar()).filter((c) => c.category === 'IN_PROGRESS');
    expect(enCurso).toHaveLength(3);
  });

  it('rechaza con 409 un nombre repetido dentro del mismo proyecto', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/columns`)
      .send({ name: '  por hacer  ', category: 'TODO' });

    // El índice es `lower(btrim(name))`: dos columnas indistinguibles a la
    // vista serían un fallo de usabilidad, no una libertad.
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('COLUMN_NAME_TAKEN');
  });

  it('rechaza una categoría fuera del dominio', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/columns`)
      .send({ name: 'Bloqueada', category: 'BLOCKED' });
    expect(res.status).toBe(400);
  });

  it('no acepta poner límite a una columna terminal', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/columns`)
      .send({ name: 'Entregado', category: 'DONE', wipLimit: 3 });

    // Limitar lo ya terminado no significa nada, y aceptarlo invitaría a
    // bloquear la salida del flujo. Lo impide un CHECK del motor.
    expect(res.status).toBe(400);
  });
});

describe('editar y reordenar columnas', () => {
  it('renombra sin tocar las tareas que contiene', async () => {
    const columnas = await listar();
    const enCurso = de(columnas, 'IN_PROGRESS');
    await crearTarea({ status: 'IN_PROGRESS' });

    const res = await request(app)
      .patch(`/api/projects/${projectId}/columns/${enCurso.id}`)
      .send({ name: 'Desarrollo' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Desarrollo');
    expect(de(await listar(), 'IN_PROGRESS').taskCount).toBe(1);
  });

  it('no deja cambiar la categoría de una columna', async () => {
    const enCurso = de(await listar(), 'IN_PROGRESS');
    const res = await request(app)
      .patch(`/api/projects/${projectId}/columns/${enCurso.id}`)
      .send({ category: 'DONE' });

    // Cambiarla movería el estado de todas sus tareas por efecto colateral,
    // sellando o borrando fechas de completado que nadie pidió tocar.
    expect(res.status).toBe(400);
  });

  it('reordena el tablero entero en una sola operación', async () => {
    const columnas = await listar();
    const invertido = [...columnas].reverse().map((c) => c.id);

    const res = await request(app)
      .patch(`/api/projects/${projectId}/columns/reorder`)
      .send({ columnIds: invertido });

    expect(res.status).toBe(200);
    expect((res.body as Columna[]).map((c) => c.name)).toEqual([
      'Completada',
      'En curso',
      'Por hacer',
    ]);
  });

  it('rechaza un reordenamiento incompleto', async () => {
    const columnas = await listar();
    const res = await request(app)
      .patch(`/api/projects/${projectId}/columns/reorder`)
      .send({ columnIds: [columnas[0]!.id] });

    // Una lista parcial dejaría columnas sin posición asignada.
    expect(res.status).toBe(404);
  });

  it('una columna de otro proyecto no se puede tocar desde este', async () => {
    const { body: otro } = await request(app).post('/api/projects').send({ name: 'Otro proyecto' });
    const { body: susColumnas } = await request(app).get(`/api/projects/${otro.id}/columns`);

    const res = await request(app)
      .patch(`/api/projects/${projectId}/columns/${(susColumnas as Columna[])[0]!.id}`)
      .send({ name: 'Secuestrada' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('COLUMN_NOT_FOUND');
  });
});

describe('eliminar columnas', () => {
  it('elimina una columna vacía y recompacta las posiciones', async () => {
    const { body: nueva } = await request(app)
      .post(`/api/projects/${projectId}/columns`)
      .send({ name: 'En revisión', category: 'IN_PROGRESS' });

    expect((await request(app).delete(`/api/projects/${projectId}/columns/${nueva.id}`)).status).toBe(204);
    expect((await listar()).map((c) => c.position)).toEqual([1, 2, 3]);
  });

  it('409 al eliminar una columna con tareas, y dice cuántas hay', async () => {
    const { body: nueva } = await request(app)
      .post(`/api/projects/${projectId}/columns`)
      .send({ name: 'En revisión', category: 'IN_PROGRESS' });
    await crearTarea({ columnId: nueva.id });

    const res = await request(app).delete(`/api/projects/${projectId}/columns/${nueva.id}`);

    // Mismo criterio que borrar un proyecto con tareas: no hay cascada sobre
    // trabajo ajeno.
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('COLUMN_HAS_TASKS');
    expect(res.body.detail).toContain('1');
    expect((await listar()).some((c) => c.id === nueva.id)).toBe(true);
  });

  it('con destino explícito mueve las tareas y borra, todo o nada', async () => {
    const { body: nueva } = await request(app)
      .post(`/api/projects/${projectId}/columns`)
      .send({ name: 'En revisión', category: 'IN_PROGRESS' });
    const { body: tarea } = await crearTarea({ columnId: nueva.id });
    const destino = de(await listar(), 'DONE');

    const res = await request(app).delete(
      `/api/projects/${projectId}/columns/${nueva.id}?reassignTo=${destino.id}`,
    );
    expect(res.status).toBe(204);

    // El estado viaja con la columna, y el trigger sella `completedAt` porque
    // el destino es terminal.
    const { body: movida } = await request(app).get(`/api/tasks/${tarea.id}`);
    expect(movida.status).toBe('DONE');
    expect(movida.completedAt).toEqual(expect.any(String));
  });

  it('no deja eliminar la última columna de una categoría', async () => {
    const enCurso = de(await listar(), 'IN_PROGRESS');
    const res = await request(app).delete(`/api/projects/${projectId}/columns/${enCurso.id}`);

    // Sin columna de trabajo en curso el tablero deja de ser un flujo.
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('LAST_COLUMN_OF_CATEGORY');
  });

  it('reasignar respeta el límite de la columna destino', async () => {
    const { body: nueva } = await request(app)
      .post(`/api/projects/${projectId}/columns`)
      .send({ name: 'En revisión', category: 'IN_PROGRESS' });
    await crearTarea({ columnId: nueva.id, title: 'a' });
    await crearTarea({ columnId: nueva.id, title: 'b' });

    const enCurso = de(await listar(), 'IN_PROGRESS');
    await request(app)
      .patch(`/api/projects/${projectId}/columns/${enCurso.id}`)
      .send({ wipLimit: 1 });

    const res = await request(app).delete(
      `/api/projects/${projectId}/columns/${nueva.id}?reassignTo=${enCurso.id}`,
    );

    // Reasignar no es una excusa para saltarse el límite del destino.
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('WIP_LIMIT_REACHED');
  });
});

describe('la invariante entre columna y estado', () => {
  it('mover una tarea a otra columna cambia su estado en el mismo paso', async () => {
    const { body: tarea } = await crearTarea();
    const done = de(await listar(), 'DONE');

    const res = await request(app).patch(`/api/tasks/${tarea.id}`).send({ columnId: done.id });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ columnId: done.id, status: 'DONE' });
    expect(res.body.completedAt).toEqual(expect.any(String));
  });

  it('mover entre dos columnas de la misma categoría conserva la fecha de completado', async () => {
    const { body: entregado } = await request(app)
      .post(`/api/projects/${projectId}/columns`)
      .send({ name: 'Entregado', category: 'DONE' });

    const { body: tarea } = await crearTarea({ status: 'DONE' });
    const sellada = tarea.completedAt as string;

    const { body: movida } = await request(app)
      .patch(`/api/tasks/${tarea.id}`)
      .send({ columnId: entregado.id });

    // El estado no cambió, así que el trigger no vuelve a sellar: seguiría
    // siendo la misma tarea terminada, solo que archivada en otro sitio.
    expect(movida.completedAt).toBe(sellada);
  });

  it('rechaza una columna que pertenece a otro proyecto', async () => {
    const { body: otro } = await request(app).post('/api/projects').send({ name: 'Ajeno' });
    const { body: ajenas } = await request(app).get(`/api/projects/${otro.id}/columns`);
    const { body: tarea } = await crearTarea();

    const res = await request(app)
      .patch(`/api/tasks/${tarea.id}`)
      .send({ columnId: (ajenas as Columna[])[0]!.id });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('COLUMN_NOT_FOUND');
  });

  it('`columnId` gana sobre `status` cuando llegan los dos', async () => {
    const { body: entregado } = await request(app)
      .post(`/api/projects/${projectId}/columns`)
      .send({ name: 'Entregado', category: 'DONE' });
    const { body: tarea } = await crearTarea();

    const { body: movida } = await request(app)
      .patch(`/api/tasks/${tarea.id}`)
      .send({ columnId: entregado.id, status: 'TODO' });

    // Solo el identificador dice a cuál de las columnas terminales va.
    expect(movida.columnId).toBe(entregado.id);
    expect(movida.status).toBe('DONE');
  });
});

describe('orden configurable por columna', () => {
  const tareaCon = (titulo: string, priority: string) => crearTarea({ title: titulo, priority });

  it('cada columna ordena por su propio criterio, en una sola consulta', async () => {
    const columnas = await listar();
    const porHacer = de(columnas, 'TODO');

    await request(app)
      .patch(`/api/projects/${projectId}/columns/${porHacer.id}`)
      .send({ sort: 'priority_desc' });

    await tareaCon('baja', 'LOW');
    await tareaCon('alta', 'HIGH');
    await tareaCon('media', 'MEDIUM');

    // Con prioridad alta primero:
    const { body: antes } = await request(app).get(`/api/projects/${projectId}/tasks`);
    expect((antes as Array<{ title: string }>).map((t) => t.title)).toEqual([
      'alta',
      'media',
      'baja',
    ]);

    await request(app)
      .patch(`/api/projects/${projectId}/columns/${porHacer.id}`)
      .send({ sort: 'priority_asc' });

    const { body: despues } = await request(app).get(`/api/projects/${projectId}/tasks`);
    expect((despues as Array<{ title: string }>).map((t) => t.title)).toEqual([
      'baja',
      'media',
      'alta',
    ]);
  });

  it('el criterio se guarda en la columna, así que lo ve todo el equipo', async () => {
    const porHacer = de(await listar(), 'TODO');
    await request(app)
      .patch(`/api/projects/${projectId}/columns/${porHacer.id}`)
      .send({ sort: 'created_asc' });

    // Sin sesión ni cabecera de por medio: otra petición cualquiera lo ve.
    expect(de(await listar(), 'TODO').sort).toBe('created_asc');
  });

  it('rechaza un criterio que no existe', async () => {
    const porHacer = de(await listar(), 'TODO');
    const res = await request(app)
      .patch(`/api/projects/${projectId}/columns/${porHacer.id}`)
      .send({ sort: 'alfabetico' });

    expect(res.status).toBe(400);
  });
});

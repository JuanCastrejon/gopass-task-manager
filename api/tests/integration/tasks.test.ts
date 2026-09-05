import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';

let app: Express;
let projectId: string;

beforeAll(async () => {
  ({ app } = await import('../helpers/app.js'));
});

beforeEach(async () => {
  const { body } = await request(app).post('/api/projects').send({ name: 'Proyecto de prueba' });
  projectId = body.id as string;
});

const crearTarea = (body: Record<string, unknown> = {}) =>
  request(app)
    .post(`/api/projects/${projectId}/tasks`)
    .send({ title: 'Una tarea', ...body });

const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

/**
 * No se repite aquí lo que ya cubren las 25 pruebas de proyectos: el formato
 * RFC 7807, la cabecera `X-Request-Id`, el 400 por UUID mal formado en cada
 * ruta ni la traducción genérica de errores del motor.
 *
 * Tampoco se prueba el `22P02` que produciría un `status` fuera del enum: Zod
 * lo rechaza antes de tocar la base, y el camino del motor ya está cubierto
 * por las unitarias de `pg-error`. Forzar ese camino exigiría puentear la
 * frontera de confianza, que es justo lo que no debe pasar.
 */

describe('el trigger de completed_at, visto desde la API', () => {
  it('recorre el ciclo completo sin que la aplicación escriba nunca la fecha', async () => {
    // Nace en TODO: sin fecha de completado.
    const { body: creada } = await crearTarea();
    expect(creada.status).toBe('TODO');
    expect(creada.completedAt).toBeNull();

    // Transición a DONE: la base sella la fecha.
    const done = await request(app).patch(`/api/tasks/${creada.id}`).send({ status: 'DONE' });
    expect(done.status).toBe(200);
    expect(done.body.completedAt).toEqual(expect.any(String));
    const primerSello = done.body.completedAt as string;

    // Editar sin tocar el estado no mueve la fecha.
    const editada = await request(app)
      .patch(`/api/tasks/${creada.id}`)
      .send({ title: 'Título nuevo' });
    expect(editada.body.completedAt).toBe(primerSello);

    // Volver a mandar DONE tampoco: solo sella la transición.
    const otraVezDone = await request(app)
      .patch(`/api/tasks/${creada.id}`)
      .send({ status: 'DONE' });
    expect(otraVezDone.body.completedAt).toBe(primerSello);

    // Salir de DONE limpia la fecha.
    const reabierta = await request(app)
      .patch(`/api/tasks/${creada.id}`)
      .send({ status: 'IN_PROGRESS' });
    expect(reabierta.body.completedAt).toBeNull();

    // Y volver a DONE la vuelve a sellar, con una fecha distinta.
    const reCompletada = await request(app)
      .patch(`/api/tasks/${creada.id}`)
      .send({ status: 'DONE' });
    expect(reCompletada.body.completedAt).toEqual(expect.any(String));
    expect(reCompletada.body.completedAt).not.toBe(primerSello);
  });

  it('una tarea creada directamente como DONE ya nace sellada', async () => {
    const { body } = await crearTarea({ status: 'DONE' });
    expect(body.status).toBe('DONE');
    expect(body.completedAt).toEqual(expect.any(String));
  });
});

describe('POST /api/projects/:projectId/tasks', () => {
  it('crea con los valores por defecto de la base', async () => {
    const res = await crearTarea({ title: 'Definir contrato' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      projectId,
      title: 'Definir contrato',
      status: 'TODO',
      priority: 'MEDIUM',
      description: null,
      completedAt: null,
    });
  });

  it('404 PROJECT_NOT_FOUND si el proyecto no existe, no 500 ni tarea huérfana', async () => {
    const res = await request(app)
      .post(`/api/projects/${UUID_INEXISTENTE}/tasks`)
      .send({ title: 'Huérfana' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PROJECT_NOT_FOUND');
  });

  it('rechaza un título en blanco y uno de más de 200 caracteres', async () => {
    expect((await crearTarea({ title: '   ' })).status).toBe(400);
    expect((await crearTarea({ title: 'x'.repeat(201) })).status).toBe(400);
  });

  it('rechaza un estado que no pertenece al enum antes de tocar la base', async () => {
    const res = await crearTarea({ status: 'BANANA' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('el esquema estricto cierra los campos que la API no controla', () => {
  it('rechaza completedAt en la creación en vez de descartarlo en silencio', async () => {
    const res = await crearTarea({ completedAt: '2020-01-01T00:00:00.000Z' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rechaza completedAt en el PATCH', async () => {
    const { body: tarea } = await crearTarea();
    const res = await request(app)
      .patch(`/api/tasks/${tarea.id}`)
      .send({ status: 'DONE', completedAt: '2020-01-01T00:00:00.000Z' });

    expect(res.status).toBe(400);
  });

  it('una errata en el nombre del campo falla en vez de guardar un parche vacío', async () => {
    const { body: tarea } = await crearTarea();
    const res = await request(app).patch(`/api/tasks/${tarea.id}`).send({ staus: 'DONE' });

    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/tasks/:id', () => {
  it('actualiza solo lo enviado y deja el resto intacto', async () => {
    const { body: tarea } = await crearTarea({ title: 'Original', priority: 'LOW' });
    const res = await request(app).patch(`/api/tasks/${tarea.id}`).send({ priority: 'HIGH' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: 'Original', priority: 'HIGH', status: 'TODO' });
  });

  it('un null explícito borra la descripción', async () => {
    const { body: tarea } = await crearTarea({ description: 'a borrar' });
    const res = await request(app).patch(`/api/tasks/${tarea.id}`).send({ description: null });

    expect(res.body.description).toBeNull();
  });

  it('400 con el body vacío', async () => {
    const { body: tarea } = await crearTarea();
    expect((await request(app).patch(`/api/tasks/${tarea.id}`).send({})).status).toBe(400);
  });

  it('404 sobre una tarea inexistente', async () => {
    const res = await request(app)
      .patch(`/api/tasks/${UUID_INEXISTENTE}`)
      .send({ title: 'Da igual' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('TASK_NOT_FOUND');
  });
});

describe('reasignar una tarea a otro proyecto', () => {
  it('mueve la tarea y deja de aparecer en el proyecto de origen', async () => {
    const { body: destino } = await request(app)
      .post('/api/projects')
      .send({ name: 'Proyecto destino' });
    const { body: tarea } = await crearTarea();

    const res = await request(app)
      .patch(`/api/tasks/${tarea.id}`)
      .send({ projectId: destino.id });

    expect(res.status).toBe(200);
    expect(res.body.projectId).toBe(destino.id);
    expect((await request(app).get(`/api/projects/${projectId}/tasks`)).body).toHaveLength(0);
    expect((await request(app).get(`/api/projects/${destino.id}/tasks`)).body).toHaveLength(1);
  });

  it('404 PROJECT_NOT_FOUND si el proyecto destino no existe', async () => {
    const { body: tarea } = await crearTarea();
    const res = await request(app)
      .patch(`/api/tasks/${tarea.id}`)
      .send({ projectId: UUID_INEXISTENTE });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PROJECT_NOT_FOUND');
  });

  it('mover las tareas desbloquea el borrado del proyecto que devolvía 409', async () => {
    const { body: destino } = await request(app).post('/api/projects').send({ name: 'Destino 2' });
    const { body: tarea } = await crearTarea();

    // Con la tarea dentro, el proyecto no se puede borrar.
    expect((await request(app).delete(`/api/projects/${projectId}`)).status).toBe(409);

    await request(app).patch(`/api/tasks/${tarea.id}`).send({ projectId: destino.id });

    // Movida la tarea, sí.
    expect((await request(app).delete(`/api/projects/${projectId}`)).status).toBe(204);
  });
});

describe('GET /api/projects/:projectId/tasks', () => {
  it('distingue un proyecto sin tareas de uno que no existe', async () => {
    const vacio = await request(app).get(`/api/projects/${projectId}/tasks`);
    expect(vacio.status).toBe(200);
    expect(vacio.body).toEqual([]);

    const inexistente = await request(app).get(`/api/projects/${UUID_INEXISTENTE}/tasks`);
    expect(inexistente.status).toBe(404);
    expect(inexistente.body.code).toBe('PROJECT_NOT_FOUND');
  });

  it('ordena por prioridad descendente sin necesidad de un CASE', async () => {
    await crearTarea({ title: 'baja', priority: 'LOW' });
    await crearTarea({ title: 'alta', priority: 'HIGH' });
    await crearTarea({ title: 'media', priority: 'MEDIUM' });

    const res = await request(app).get(`/api/projects/${projectId}/tasks`);
    expect(res.body.map((t: { title: string }) => t.title)).toEqual(['alta', 'media', 'baja']);
  });

  it('no mezcla las tareas de otro proyecto', async () => {
    const { body: otro } = await request(app).post('/api/projects').send({ name: 'El otro' });
    await crearTarea({ title: 'mía' });
    await request(app).post(`/api/projects/${otro.id}/tasks`).send({ title: 'ajena' });

    const res = await request(app).get(`/api/projects/${projectId}/tasks`);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('mía');
  });
});

describe('filtros y búsqueda (RF-13)', () => {
  beforeEach(async () => {
    await crearTarea({ title: 'Conciliar recaudo', status: 'DONE', priority: 'HIGH' });
    await crearTarea({ title: 'Homologar lectores', status: 'TODO', priority: 'HIGH' });
    await crearTarea({ title: 'Revisar contrato', status: 'IN_PROGRESS', priority: 'LOW' });
  });

  const titulos = (body: Array<{ title: string }>) => body.map((t) => t.title).sort();

  it('filtra por estado, y el parámetro es repetible', async () => {
    const uno = await request(app).get(`/api/projects/${projectId}/tasks?status=DONE`);
    expect(titulos(uno.body)).toEqual(['Conciliar recaudo']);

    const dos = await request(app).get(
      `/api/projects/${projectId}/tasks?status=DONE&status=TODO`,
    );
    expect(titulos(dos.body)).toEqual(['Conciliar recaudo', 'Homologar lectores']);
  });

  it('filtra por prioridad y combina con el estado', async () => {
    const res = await request(app).get(
      `/api/projects/${projectId}/tasks?priority=HIGH&status=TODO`,
    );
    expect(titulos(res.body)).toEqual(['Homologar lectores']);
  });

  it('busca por título sin distinguir mayúsculas', async () => {
    const res = await request(app).get(`/api/projects/${projectId}/tasks?q=CONTRATO`);
    expect(titulos(res.body)).toEqual(['Revisar contrato']);
  });

  it('repetir el mismo valor no cambia el resultado', async () => {
    const res = await request(app).get(
      `/api/projects/${projectId}/tasks?status=DONE&status=DONE`,
    );
    expect(res.body).toHaveLength(1);
  });

  it('un filtro sin coincidencias devuelve lista vacía, no 404', async () => {
    const res = await request(app).get(`/api/projects/${projectId}/tasks?q=zzzzz`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('un valor fuera del enum devuelve 400, no lo ignora en silencio', async () => {
    const res = await request(app).get(`/api/projects/${projectId}/tasks?status=BANANA`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('un filtro vacío es un error del cliente, no "todos"', async () => {
    const res = await request(app).get(`/api/projects/${projectId}/tasks?status=`);
    expect(res.status).toBe(400);
  });
});

describe('GET y DELETE /api/tasks/:id', () => {
  it('lee la tarea y la borra sin restricción', async () => {
    const { body: tarea } = await crearTarea();

    expect((await request(app).get(`/api/tasks/${tarea.id}`)).status).toBe(200);

    const borrada = await request(app).delete(`/api/tasks/${tarea.id}`);
    expect(borrada.status).toBe(204);
    expect(borrada.text).toBe('');

    expect((await request(app).get(`/api/tasks/${tarea.id}`)).status).toBe(404);
  });

  it('404 al borrar una tarea que no existe', async () => {
    const res = await request(app).delete(`/api/tasks/${UUID_INEXISTENTE}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('TASK_NOT_FOUND');
  });
});

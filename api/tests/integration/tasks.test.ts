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

/**
 * Límite de trabajo en curso (WIP).
 *
 * Es la única regla del método kanban que el tablero impone de verdad, así que
 * se prueba contra PostgreSQL real: lo que hay que demostrar no es que un `if`
 * de JavaScript funcione, sino que dos peticiones simultáneas no puedan
 * saltárselo. Eso solo se ve con una base de datos de verdad.
 */
describe('límite de trabajo en curso', () => {
  /**
   * El límite vive en la columna, no en el proyecto: «Desarrollo» máximo 3 y
   * «QA» máximo 2 es una política real que un único límite por proyecto no
   * podría expresar.
   */
  const columnaEnCurso = async (): Promise<string> => {
    const { body } = await request(app).get(`/api/projects/${projectId}/columns`);
    return (body as Array<{ id: string; category: string }>).find(
      (c) => c.category === 'IN_PROGRESS',
    )!.id;
  };

  const ponerLimite = async (limite: number | null) =>
    request(app)
      .patch(`/api/projects/${projectId}/columns/${await columnaEnCurso()}`)
      .send({ wipLimit: limite });

  const mover = (id: string, status: string) =>
    request(app).patch(`/api/tasks/${id}`).send({ status });

  it('sin límite declarado no impone nada', async () => {
    const tareas = await Promise.all([crearTarea(), crearTarea(), crearTarea()]);
    for (const { body } of tareas) {
      expect((await mover(body.id, 'IN_PROGRESS')).status).toBe(200);
    }
  });

  it('rechaza con 409 la tarea que supera el límite, y explica cuánto es', async () => {
    await ponerLimite(2);
    const { body: a } = await crearTarea({ title: 'a' });
    const { body: b } = await crearTarea({ title: 'b' });
    const { body: c } = await crearTarea({ title: 'c' });

    expect((await mover(a.id, 'IN_PROGRESS')).status).toBe(200);
    expect((await mover(b.id, 'IN_PROGRESS')).status).toBe(200);

    const rechazada = await mover(c.id, 'IN_PROGRESS');
    expect(rechazada.status).toBe(409);
    expect(rechazada.body.code).toBe('WIP_LIMIT_REACHED');
    // El mensaje dice el número: un límite alcanzado sin cifra no es accionable.
    expect(rechazada.body.detail).toContain('2');

    // Y la tarea sigue donde estaba: el 409 no deja a medias.
    const { body: sinMover } = await request(app).get(`/api/tasks/${c.id}`);
    expect(sinMover.status).toBe('TODO');
  });

  it('crear una tarea directamente en curso consume el mismo cupo', async () => {
    await ponerLimite(1);
    expect((await crearTarea({ title: 'primera', status: 'IN_PROGRESS' })).status).toBe(201);

    const segunda = await crearTarea({ title: 'segunda', status: 'IN_PROGRESS' });
    expect(segunda.status).toBe(409);
    expect(segunda.body.code).toBe('WIP_LIMIT_REACHED');
  });

  it('editar una tarea que ya está en curso no la cuenta dos veces', async () => {
    await ponerLimite(1);
    const { body: unica } = await crearTarea({ status: 'IN_PROGRESS' });

    // Con el tablero lleno, reenviar su mismo estado o corregir el título tiene
    // que seguir funcionando: si no, el límite sería una trampa que impide
    // arreglar una errata.
    expect((await mover(unica.id, 'IN_PROGRESS')).status).toBe(200);
    const editada = await request(app).patch(`/api/tasks/${unica.id}`).send({ title: 'Título corregido' });
    expect(editada.status).toBe(200);
  });

  it('sacar una tarea de en curso libera el hueco', async () => {
    await ponerLimite(1);
    const { body: a } = await crearTarea({ title: 'a', status: 'IN_PROGRESS' });
    const { body: b } = await crearTarea({ title: 'b' });

    expect((await mover(b.id, 'IN_PROGRESS')).status).toBe(409);
    expect((await mover(a.id, 'DONE')).status).toBe(200);
    expect((await mover(b.id, 'IN_PROGRESS')).status).toBe(200);
  });

  it('quitar el límite con null vuelve a dejar pasar todo', async () => {
    await ponerLimite(1);
    const { body: a } = await crearTarea({ title: 'a', status: 'IN_PROGRESS' });
    const { body: b } = await crearTarea({ title: 'b' });
    expect((await mover(b.id, 'IN_PROGRESS')).status).toBe(409);

    expect((await ponerLimite(null)).status).toBe(200);
    expect((await mover(b.id, 'IN_PROGRESS')).status).toBe(200);
    expect(a.id).toBeTruthy();
  });

  it('un límite de 0 o negativo se rechaza con 400', async () => {
    expect((await ponerLimite(0)).status).toBe(400);
    expect((await ponerLimite(-3)).status).toBe(400);
  });

  /**
   * La prueba que justifica el `FOR UPDATE`.
   *
   * Con un solo hueco libre y dos peticiones lanzadas a la vez, sin bloqueo las
   * dos leen «0 en curso», las dos concluyen que cabe y las dos entran: el
   * tablero acabaría con 2 tareas en curso y un límite de 1. Se comprobó que
   * esto es exactamente lo que ocurre al quitar el `FOR UPDATE`.
   */
  it('dos movimientos simultáneos no se saltan el límite entre los dos', async () => {
    await ponerLimite(1);
    const { body: a } = await crearTarea({ title: 'a' });
    const { body: b } = await crearTarea({ title: 'b' });

    const resultados = await Promise.all([
      mover(a.id, 'IN_PROGRESS'),
      mover(b.id, 'IN_PROGRESS'),
    ]);

    const codigos = resultados.map((r) => r.status).sort();
    expect(codigos).toEqual([200, 409]);

    const { body: enCurso } = await request(app).get(
      `/api/projects/${projectId}/tasks?status=IN_PROGRESS`,
    );
    expect(enCurso).toHaveLength(1);
  });

  it('el listado de columnas expone el límite y cuántas tareas contiene', async () => {
    await ponerLimite(3);
    const { body: t } = await crearTarea({ status: 'IN_PROGRESS' });
    expect(t.status).toBe('IN_PROGRESS');

    const { body: columnas } = await request(app).get(`/api/projects/${projectId}/columns`);
    const enCurso = (columnas as Array<Record<string, unknown>>).find(
      (c) => c['category'] === 'IN_PROGRESS',
    );
    expect(enCurso).toMatchObject({ wipLimit: 3, taskCount: 1 });
  });
});

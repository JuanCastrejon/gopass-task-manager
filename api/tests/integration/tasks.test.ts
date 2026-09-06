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

  it('ordena por prioridad descendente cuando la columna tiene configurado sort = "priority_desc"', async () => {
    const { body: columnas } = await request(app).get(`/api/projects/${projectId}/columns`);
    const porHacer = (columnas as Array<{ id: string; category: string }>).find(
      (c) => c.category === 'TODO',
    )!;
    await request(app)
      .patch(`/api/projects/${projectId}/columns/${porHacer.id}`)
      .send({ sort: 'priority_desc' });

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

describe('orden manual de tareas dentro de una columna (SL-15)', () => {
  it('1. reordenar dentro de una columna con sort = "manual" persiste el orden y una segunda lectura lo devuelve igual', async () => {
    const { body: columnas } = await request(app).get(`/api/projects/${projectId}/columns`);
    const porHacer = (columnas as Array<{ id: string; category: string; sort: string }>).find(
      (c) => c.category === 'TODO',
    )!;

    // La columna ya nace por defecto con sort = 'manual' (Corrección 1)
    expect(porHacer.sort).toBe('manual');

    // Crear 3 tareas: T1, T2, T3
    const { body: t1 } = await crearTarea({ title: 'T1' });
    const { body: t2 } = await crearTarea({ title: 'T2' });
    const { body: t3 } = await crearTarea({ title: 'T3' });

    // Reordenar T3 para que quede en medio de T1 y T2
    const reorderRes = await request(app)
      .patch(`/api/tasks/${t3.id}/reorder`)
      .send({ columnId: porHacer.id, previousTaskId: t1.id, nextTaskId: t2.id });
    expect(reorderRes.status).toBe(200);
    expect(reorderRes.body.position).toBe((t1.position + t2.position) / 2);

    // Primera lectura: el orden debe ser T1, T3, T2
    const { body: lectura1 } = await request(app).get(`/api/projects/${projectId}/tasks`);
    expect(lectura1.map((t: { id: string }) => t.id)).toEqual([t1.id, t3.id, t2.id]);

    // Segunda lectura: el orden se mantiene exactamente igual
    const { body: lectura2 } = await request(app).get(`/api/projects/${projectId}/tasks`);
    expect(lectura2.map((t: { id: string }) => t.id)).toEqual([t1.id, t3.id, t2.id]);
  });

  it('2. una columna con sort = "priority_desc" sigue ordenando por prioridad aunque las tareas tengan posiciones que digan lo contrario (ADR-024)', async () => {
    const { body: columnas } = await request(app).get(`/api/projects/${projectId}/columns`);
    const porHacer = (columnas as Array<{ id: string; category: string; sort: string }>).find(
      (c) => c.category === 'TODO',
    )!;

    await request(app)
      .patch(`/api/projects/${projectId}/columns/${porHacer.id}`)
      .send({ sort: 'priority_desc' });

    const { body: tareaBaja } = await crearTarea({ title: 'Baja', priority: 'LOW' });
    const { body: tareaAlta } = await crearTarea({ title: 'Alta', priority: 'HIGH' });

    // Reordenar la tarea de prioridad baja para situarla al principio de la columna (position < tareaAlta.position)
    const reorderRes = await request(app)
      .patch(`/api/tasks/${tareaBaja.id}/reorder`)
      .send({ columnId: porHacer.id, previousTaskId: null, nextTaskId: tareaAlta.id });
    expect(reorderRes.status).toBe(200);
    expect(reorderRes.body.position).toBeLessThan(tareaAlta.position);

    // Al listar las tareas, la regla de ADR-024 exige que la prioridad se respete por encima
    // de la posición manual cuando la columna está en priority_desc.
    const { body: tareas } = await request(app).get(`/api/projects/${projectId}/tasks`);
    expect(tareas.map((t: { id: string }) => t.id)).toEqual([tareaAlta.id, tareaBaja.id]);
  });

  it('3. agotar el hueco: 60 reordenaciones seguidas entre las dos mismas tareas funcionan y las posiciones finales son todas distintas', async () => {
    const { body: columnas } = await request(app).get(`/api/projects/${projectId}/columns`);
    const porHacer = (columnas as Array<{ id: string; category: string }>).find(
      (c) => c.category === 'TODO',
    )!;

    await request(app)
      .patch(`/api/projects/${projectId}/columns/${porHacer.id}`)
      .send({ sort: 'manual' });

    const { body: tareaA } = await crearTarea({ title: 'A' });
    const { body: tareaB } = await crearTarea({ title: 'B' });

    let siguienteId = tareaB.id;

    // Se insertan 60 tareas consecutivas siempre en el mismo hueco tras tareaA.
    // En la inserción 53 la precisión de coma flotante colapsa, disparando SQLSTATE 23505 sobre
    // la restricción tasks_position_unica. El servidor rebalancea la columna y reintenta con éxito.
    for (let i = 0; i < 60; i++) {
      const { body: nueva } = await crearTarea({ title: `T_${i}` });
      const res = await request(app)
        .patch(`/api/tasks/${nueva.id}/reorder`)
        .send({
          columnId: porHacer.id,
          previousTaskId: tareaA.id,
          nextTaskId: siguienteId,
        });

      expect(res.status).toBe(200);
      siguienteId = nueva.id;
    }

    const { body: todas } = await request(app).get(`/api/projects/${projectId}/tasks`);
    expect(todas).toHaveLength(62);

    const posiciones = todas.map((t: { position: number }) => t.position);
    const unicas = new Set(posiciones);
    expect(unicas.size).toBe(posiciones.length);
  });

  it('4. mover una tarea a otra columna con PATCH /api/tasks/:id la deja al final de la de destino', async () => {
    const { body: columnas } = await request(app).get(`/api/projects/${projectId}/columns`);
    const porHacer = (columnas as Array<{ id: string; category: string }>).find(
      (c) => c.category === 'TODO',
    )!;
    const enCurso = (columnas as Array<{ id: string; category: string }>).find(
      (c) => c.category === 'IN_PROGRESS',
    )!;

    // Crear dos tareas en la columna destino
    const { body: ec1 } = await crearTarea({ title: 'EC1', columnId: enCurso.id });
    const { body: ec2 } = await crearTarea({ title: 'EC2', columnId: enCurso.id });

    // Crear una tarea en la columna de origen
    const { body: ph } = await crearTarea({ title: 'PH', columnId: porHacer.id });

    // Mover la tarea de origen a la columna destino vía PATCH regular
    const patchRes = await request(app)
      .patch(`/api/tasks/${ph.id}`)
      .send({ columnId: enCurso.id });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.columnId).toBe(enCurso.id);

    const maxPosDestino = Math.max(ec1.position, ec2.position);
    expect(patchRes.body.position).toBeGreaterThan(maxPosDestino);
    expect(patchRes.body.position).toBe(maxPosDestino + 1024.0);
  });

  it('5. el backfill de la migración no cambia el orden de las tareas que ya existían', async () => {
    const { pool } = await import('../../src/db/pool.js');
    const { body: columnas } = await request(app).get(`/api/projects/${projectId}/columns`);
    const porHacer = (columnas as Array<{ id: string; category: string }>).find(
      (c) => c.category === 'TODO',
    )!;

    // Insertar tareas simulando el estado previo a la migración
    const baseTime = new Date('2026-01-01T12:00:00Z').getTime();
    const tareasCreadas: Array<{ id: string; createdAt: Date }> = [];

    for (let i = 0; i < 5; i++) {
      const createdAt = new Date(baseTime + i * 100000);
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO tasks (project_id, column_id, title, status, created_at, position)
         VALUES ($1, $2, $3, 'TODO', $4, $5)
         RETURNING id`,
        [projectId, porHacer.id, `Tarea Historica ${i}`, createdAt, (i + 1) * 100.0],
      );
      tareasCreadas.push({ id: rows[0]!.id, createdAt });
    }

    // Orden esperado históricamente: created_at DESC, id
    const ordenEsperado = [...tareasCreadas]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id))
      .map((t) => t.id);

    // Aplicar la sentencia exacta del backfill de 0006_tasks_position.sql
    await pool.query(`
      UPDATE tasks t SET position = sub.pos FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY column_id ORDER BY created_at DESC, id) * 1024.0 AS pos
        FROM tasks
      ) sub WHERE t.id = sub.id;
    `);

    // Al configurar la columna con orden manual, el orden resultante debe ser
    // exactamente idéntico al orden histórico.
    await request(app)
      .patch(`/api/projects/${projectId}/columns/${porHacer.id}`)
      .send({ sort: 'manual' });

    const { body: leidas } = await request(app).get(`/api/projects/${projectId}/tasks`);
    expect(leidas.map((t: { id: string }) => t.id)).toEqual(ordenEsperado);
  });

  it('6. reordenar con ambas vecinas nulas sobre una columna no vacía responde 200 y deja la tarea al final', async () => {
    const { body: columnas } = await request(app).get(`/api/projects/${projectId}/columns`);
    const porHacer = (columnas as Array<{ id: string; category: string }>).find(
      (c) => c.category === 'TODO',
    )!;

    // Crear dos tareas en la columna: t1 (pos 1024) y t2 (pos 2048)
    const { body: t1 } = await crearTarea({ title: 'T1' });
    const { body: t2 } = await crearTarea({ title: 'T2' });

    expect(t1.position).toBe(1024.0);
    expect(t2.position).toBe(2048.0);

    // Reordenar t1 con ambas vecinas nulas sobre la columna que ya contiene a t2 (pos 2048)
    const res = await request(app)
      .patch(`/api/tasks/${t1.id}/reorder`)
      .send({
        columnId: porHacer.id,
        previousTaskId: null,
        nextTaskId: null,
      });

    expect(res.status).toBe(200);
    expect(res.body.position).toBe(t2.position + 1024.0);

    // Al listar las tareas, t1 debe ser la última tras t2
    const { body: tareas } = await request(app).get(`/api/projects/${projectId}/tasks`);
    expect(tareas.map((t: { id: string }) => t.id)).toEqual([t2.id, t1.id]);

    // Mover una tarea de otra columna con ambas vecinas nulas a esta columna no vacía
    const enCurso = (columnas as Array<{ id: string; category: string }>).find(
      (c) => c.category === 'IN_PROGRESS',
    )!;
    const { body: t3 } = await crearTarea({ title: 'T3', columnId: enCurso.id });

    const resT3 = await request(app)
      .patch(`/api/tasks/${t3.id}/reorder`)
      .send({
        columnId: porHacer.id,
        previousTaskId: null,
        nextTaskId: null,
      });

    expect(resT3.status).toBe(200);
    expect(resT3.body.position).toBe(res.body.position + 1024.0);

    const { body: tareasFinales } = await request(app).get(`/api/projects/${projectId}/tasks`);
    expect(tareasFinales.map((t: { id: string }) => t.id)).toEqual([t2.id, t1.id, t3.id]);
  });
});

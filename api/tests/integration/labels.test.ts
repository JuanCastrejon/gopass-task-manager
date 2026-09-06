import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { Pool } from 'pg';
import type { Task } from '../../src/modules/tasks/tasks.mapper.js';
import type { Label } from '../../src/modules/labels/labels.mapper.js';

let app: Express;
let pool: Pool;
let projectId: string;

beforeAll(async () => {
  ({ app } = await import('../helpers/app.js'));
  ({ pool } = await import('../../src/db/pool.js'));
});

beforeEach(async () => {
  const { body } = await request(app).post('/api/projects').send({ name: 'Proyecto de prueba' });
  projectId = body.id as string;
});

const crearTarea = (body: Record<string, unknown> = {}) =>
  request(app).post(`/api/projects/${projectId}/tasks`).send({ title: 'Una tarea', ...body });

const crearEtiqueta = (body: Record<string, unknown> = {}, pId: string = projectId) =>
  request(app).post(`/api/projects/${pId}/labels`).send({ name: 'Backend', color: 'blue', ...body });

describe('SL-18 — Gestión de etiquetas de color', () => {
  describe('1. Crear etiqueta y unicidad por nombre dentro del proyecto', () => {
    it('crea una etiqueta; nombre duplicado en el mismo proyecto devuelve 409; el mismo nombre en otro proyecto devuelve 201', async () => {
      // Alta de la primera etiqueta en el proyecto
      const res1 = await crearEtiqueta({ name: 'Backend', color: 'blue' });
      expect(res1.status).toBe(201);
      expect(res1.body).toMatchObject({
        projectId,
        name: 'Backend',
        color: 'blue',
      });
      expect(res1.body.id).toBeDefined();

      // Nombre duplicado insensible a mayúsculas y espacios en el mismo proyecto -> 409
      const resDup = await crearEtiqueta({ name: '  backend  ', color: 'red' });
      expect(resDup.status).toBe(409);
      expect(resDup.body.code).toBe('LABEL_NAME_TAKEN');

      // Mismo nombre en otro proyecto -> 201 (la unicidad es por proyecto, no global)
      const { body: otroProyecto } = await request(app)
        .post('/api/projects')
        .send({ name: 'Otro proyecto independiente' });

      const resOtro = await crearEtiqueta({ name: 'Backend', color: 'green' }, otroProyecto.id);
      expect(resOtro.status).toBe(201);
      expect(resOtro.body.name).toBe('Backend');
      expect(resOtro.body.projectId).toBe(otroProyecto.id);
    });

    it('rechaza colores fuera de la paleta cerrada de 12 tanto en Zod como en la base', async () => {
      const resInvalido = await crearEtiqueta({ name: 'Inválido', color: 'magenta_neon' });
      expect(resInvalido.status).toBe(400);
      expect(resInvalido.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('2. Claves foráneas compuestas: aislamiento entre proyectos', () => {
    it('una tarea no puede recibir una etiqueta de otro proyecto', async () => {
      // Proyecto A (projectId) con una tarea A
      const { body: tareaA } = await crearTarea({ title: 'Tarea en proyecto A' });

      // Proyecto B con una etiqueta B
      const { body: proyectoB } = await request(app)
        .post('/api/projects')
        .send({ name: 'Proyecto B' });
      const { body: etiquetaB } = await crearEtiqueta(
        { name: 'Etiqueta B', color: 'purple' },
        proyectoB.id,
      );

      // Intentar asignar etiqueta de B a tarea de A vía endpoint PUT -> 400
      const res = await request(app)
        .put(`/api/tasks/${tareaA.id}/labels`)
        .send({ labelIds: [etiquetaB.id] });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');

      // Verificación directa contra el motor PostgreSQL: la inserción cruzada falla con 23503
      // debido a CONSTRAINT task_labels_label_fkey FOREIGN KEY (label_id, project_id)
      await expect(
        pool.query(
          'INSERT INTO task_labels (task_id, label_id, project_id) VALUES ($1, $2, $3)',
          [tareaA.id, etiquetaB.id, projectId],
        ),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'task_labels_label_fkey',
      });
    });

    it('al retirar temporalmente la foránea compuesta la asignación cruzada se acepta, y con ella se rechaza con 23503', async () => {
      const { body: tareaA } = await crearTarea({ title: 'Tarea en A para prueba de foránea compuesta' });
      const { body: proyectoB } = await request(app).post('/api/projects').send({ name: 'Proyecto B temporal' });
      const { body: etiquetaB } = await crearEtiqueta({ name: 'Etiqueta B temporal', color: 'pink' }, proyectoB.id);

      // 1. Con la clave foránea compuesta: rechazada con 23503
      await expect(
        pool.query('INSERT INTO task_labels (task_id, label_id, project_id) VALUES ($1, $2, $3)', [
          tareaA.id,
          etiquetaB.id,
          projectId,
        ]),
      ).rejects.toMatchObject({ code: '23503', constraint: 'task_labels_label_fkey' });

      // 2. Retirar la clave compuesta y dejar una foránea simple por label_id -> labels(id)
      await pool.query('ALTER TABLE task_labels DROP CONSTRAINT task_labels_label_fkey');
      await pool.query('ALTER TABLE task_labels ADD CONSTRAINT task_labels_label_simple_fkey FOREIGN KEY (label_id) REFERENCES labels (id)');

      // 3. Sin la clave compuesta: la asignación cruzada SE ACEPTA en el motor
      const resCruzada = await pool.query(
        'INSERT INTO task_labels (task_id, label_id, project_id) VALUES ($1, $2, $3) RETURNING *',
        [tareaA.id, etiquetaB.id, projectId],
      );
      expect(resCruzada.rows).toHaveLength(1);
      expect(resCruzada.rows[0].label_id).toBe(etiquetaB.id);

      // 4. Limpiar fila cruzada y restaurar la clave foránea compuesta
      await pool.query('DELETE FROM task_labels WHERE task_id = $1 AND label_id = $2', [tareaA.id, etiquetaB.id]);
      await pool.query('ALTER TABLE task_labels DROP CONSTRAINT task_labels_label_simple_fkey');
      await pool.query(
        'ALTER TABLE task_labels ADD CONSTRAINT task_labels_label_fkey FOREIGN KEY (label_id, project_id) REFERENCES labels (id, project_id) ON DELETE CASCADE',
      );

      // 5. Con la clave compuesta restaurada: vuelve a rechazar con 23503
      await expect(
        pool.query('INSERT INTO task_labels (task_id, label_id, project_id) VALUES ($1, $2, $3)', [
          tareaA.id,
          etiquetaB.id,
          projectId,
        ]),
      ).rejects.toMatchObject({ code: '23503', constraint: 'task_labels_label_fkey' });
    });
  });

  describe('3. Borrar etiqueta en uso y confirmación', () => {
    it('borrar una etiqueta en uso devuelve 409 con el recuento; con confirmación borra y desasigna', async () => {
      const { body: etiqueta } = await crearEtiqueta({ name: 'EnUso', color: 'orange' });
      const { body: tarea1 } = await crearTarea({ title: 'Tarea etiquetada 1' });
      const { body: tarea2 } = await crearTarea({ title: 'Tarea etiquetada 2' });

      // Asignar la etiqueta a ambas tareas
      await request(app)
        .put(`/api/tasks/${tarea1.id}/labels`)
        .send({ labelIds: [etiqueta.id] });
      await request(app)
        .put(`/api/tasks/${tarea2.id}/labels`)
        .send({ labelIds: [etiqueta.id] });

      // Intento de borrado sin confirmar -> 409 con recuento en detail
      const resConflicto = await request(app).delete(`/api/labels/${etiqueta.id}`);
      expect(resConflicto.status).toBe(409);
      expect(resConflicto.body.code).toBe('LABEL_HAS_TASKS');
      expect(resConflicto.body.detail).toContain('2 tareas');

      // Con parámetro explícito de confirmación (?confirm=true) -> 204 y desasigna en transacción
      const resConfirmado = await request(app).delete(`/api/labels/${etiqueta.id}?confirm=true`);
      expect(resConfirmado.status).toBe(204);

      // La etiqueta ya no existe
      const resGet = await request(app).get(`/api/projects/${projectId}/labels`);
      expect((resGet.body as Label[]).some((l) => l.id === etiqueta.id)).toBe(false);

      // Las tareas siguen existiendo, ahora sin esa etiqueta
      const { body: t1 } = await request(app).get(`/api/tasks/${tarea1.id}`);
      expect((t1 as Task).labels).toEqual([]);
    });

    it('borrar una etiqueta sin tareas asociadas la elimina sin necesidad de confirmación', async () => {
      const { body: etiqueta } = await crearEtiqueta({ name: 'SinUso', color: 'teal' });
      const res = await request(app).delete(`/api/labels/${etiqueta.id}`);
      expect(res.status).toBe(204);
    });
  });

  describe('4. Filtrado por etiquetas con semántica «alguna»', () => {
    it('filtra por una etiqueta y por dos, con semántica «alguna» (OR / ANY)', async () => {
      const { body: lblFrontend } = await crearEtiqueta({ name: 'Frontend', color: 'cyan' });
      const { body: lblBackend } = await crearEtiqueta({ name: 'Backend', color: 'blue' });
      const { body: lblDevops } = await crearEtiqueta({ name: 'DevOps', color: 'slate' });

      const { body: tFrontend } = await crearTarea({ title: 'Maquetar vista' });
      const { body: tBackend } = await crearTarea({ title: 'Construir API' });
      const { body: tFullstack } = await crearTarea({ title: 'Integrar front y back' });
      const { body: tDevops } = await crearTarea({ title: 'Configurar CI/CD' });

      await request(app)
        .put(`/api/tasks/${tFrontend.id}/labels`)
        .send({ labelIds: [lblFrontend.id] });
      await request(app)
        .put(`/api/tasks/${tBackend.id}/labels`)
        .send({ labelIds: [lblBackend.id] });
      await request(app)
        .put(`/api/tasks/${tFullstack.id}/labels`)
        .send({ labelIds: [lblFrontend.id, lblBackend.id] });
      await request(app)
        .put(`/api/tasks/${tDevops.id}/labels`)
        .send({ labelIds: [lblDevops.id] });

      // Filtrar por una sola etiqueta: Frontend -> devuelve tFrontend y tFullstack
      const resUna = await request(app).get(
        `/api/projects/${projectId}/tasks?labels=${lblFrontend.id}`,
      );
      expect(resUna.status).toBe(200);
      const idsUna = (resUna.body as Task[]).map((t) => t.id);
      expect(idsUna).toHaveLength(2);
      expect(idsUna).toContain(tFrontend.id);
      expect(idsUna).toContain(tFullstack.id);
      expect(idsUna).not.toContain(tBackend.id);

      // Filtrar por dos etiquetas: Frontend y DevOps -> devuelve tFrontend, tFullstack y tDevops
      const resDos = await request(app).get(
        `/api/projects/${projectId}/tasks?labels=${lblFrontend.id}&labels=${lblDevops.id}`,
      );
      expect(resDos.status).toBe(200);
      const idsDos = (resDos.body as Task[]).map((t) => t.id);
      expect(idsDos).toHaveLength(3);
      expect(idsDos).toContain(tFrontend.id);
      expect(idsDos).toContain(tFullstack.id);
      expect(idsDos).toContain(tDevops.id);
      expect(idsDos).not.toContain(tBackend.id);
    });
  });

  describe('5. Fila fantasma y proyecto sin coincidencias', () => {
    it('un proyecto sin tareas que encajen sigue devolviendo [] con 200, no 404, con el filtro de etiqueta activo', async () => {
      // Crear una etiqueta en el proyecto
      const { body: lbl } = await crearEtiqueta({ name: 'SinTareas', color: 'amber' });

      // Hay tareas en el proyecto, pero ninguna con esta etiqueta
      await crearTarea({ title: 'Tarea no etiquetada' });

      const res = await request(app).get(
        `/api/projects/${projectId}/tasks?labels=${lbl.id}`,
      );

      // Debe responder 200 [] y no 404 PROJECT_NOT_FOUND (garantizado por el predicado en el ON del LEFT JOIN)
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('un proyecto inexistente con filtro de etiqueta devuelve 404', async () => {
      const res = await request(app).get(
        `/api/projects/00000000-0000-4000-8000-000000000000/tasks?labels=00000000-0000-4000-8000-000000000001`,
      );
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('PROJECT_NOT_FOUND');
    });
  });

  describe('6. Cardinalidad exacta sin multiplicación de filas', () => {
    it('el listado devuelve exactamente una fila por tarea aunque tenga tres etiquetas', async () => {
      const { body: l1 } = await crearEtiqueta({ name: 'Alpha', color: 'red' });
      const { body: l2 } = await crearEtiqueta({ name: 'Beta', color: 'blue' });
      const { body: l3 } = await crearEtiqueta({ name: 'Gamma', color: 'green' });

      const { body: tarea } = await crearTarea({ title: 'Tarea con 3 etiquetas' });
      await request(app)
        .put(`/api/tasks/${tarea.id}/labels`)
        .send({ labelIds: [l1.id, l2.id, l3.id] });

      const res = await request(app).get(`/api/projects/${projectId}/tasks`);
      expect(res.status).toBe(200);

      const lista = res.body as Task[];
      const coincidentes = lista.filter((t) => t.id === tarea.id);
      expect(coincidentes).toHaveLength(1);
      expect(coincidentes[0]!.labels).toHaveLength(3);
      expect(coincidentes[0]!.labels.map((l) => l.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
    });
  });

  describe('7. Edición y detalle de etiquetas', () => {
    it('PATCH /api/labels/:id actualiza nombre y color respetando restricciones', async () => {
      const { body: creada } = await crearEtiqueta({ name: 'Original', color: 'yellow' });

      const resUpdate = await request(app)
        .patch(`/api/labels/${creada.id}`)
        .send({ name: 'Modificada', color: 'pink' });

      expect(resUpdate.status).toBe(200);
      expect(resUpdate.body.name).toBe('Modificada');
      expect(resUpdate.body.color).toBe('pink');

      // Intentar renombrar a un nombre ya existente en el mismo proyecto produce 409
      await crearEtiqueta({ name: 'OtraEtiqueta', color: 'indigo' });
      const resDup = await request(app)
        .patch(`/api/labels/${creada.id}`)
        .send({ name: 'OtraEtiqueta' });
      expect(resDup.status).toBe(409);
      expect(resDup.body.code).toBe('LABEL_NAME_TAKEN');
    });

    it('GET /api/projects/:projectId/labels devuelve 404 si el proyecto no existe', async () => {
      const res = await request(app).get(
        '/api/projects/00000000-0000-4000-8000-000000000000/labels',
      );
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('PROJECT_NOT_FOUND');
    });
  });
});

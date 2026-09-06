import { Router } from 'express';
import { parsedQuery, validateBody, validateParams, validateQuery } from '../../http/validate.js';
import { toTask } from './tasks.mapper.js';
import * as repo from './tasks.repository.js';
import {
  createTaskSchema,
  listTasksQuerySchema,
  patchTaskSchema,
  projectScopedParamsSchema,
  reorderTaskSchema,
  taskIdParamsSchema,
  type CreateTaskInput,
  type ListTasksQuery,
  type PatchTaskInput,
  type ReorderTaskInput,
} from './tasks.schema.js';
import { setTaskLabelsSchema, type SetTaskLabelsInput } from '../labels/labels.schema.js';

/**
 * Rutas anidadas bajo el proyecto, con `mergeParams` para poder leer
 * `:projectId` del prefijo de montaje.
 *
 * Crear y listar cuelgan del proyecto porque una tarea **no existe sin
 * proyecto**: la relación es de composición y la URL lo dice. Editar y
 * borrar, en cambio, van por la ruta plana `/api/tasks/:id`, porque el
 * identificador de la tarea ya es único y arrastrar el del proyecto no
 * aportaría nada.
 */
export const projectTasksRouter = Router({ mergeParams: true });

projectTasksRouter.get(
  '/',
  validateParams(projectScopedParamsSchema),
  validateQuery(listTasksQuerySchema),
  (req, res, next) => {
    repo
      .listTasksByProject(req.params['projectId'] as string, parsedQuery<typeof listTasksQuerySchema>(res) as ListTasksQuery)
      .then((rows) => res.json(rows.map((row) => toTask(row))))
      .catch(next);
  },
);

projectTasksRouter.post(
  '/',
  validateParams(projectScopedParamsSchema),
  validateBody(createTaskSchema),
  (req, res, next) => {
    repo
      .createTask(req.params['projectId'] as string, req.body as CreateTaskInput)
      .then((row) => res.status(201).json(toTask(row)))
      .catch(next);
  },
);

export const tasksRouter = Router();

tasksRouter.get('/:id', validateParams(taskIdParamsSchema), (req, res, next) => {
  repo
    .findTaskById(req.params['id'] as string)
    .then((row) => res.json(toTask(row)))
    .catch(next);
});

tasksRouter.patch(
  '/:id',
  validateParams(taskIdParamsSchema),
  validateBody(patchTaskSchema),
  (req, res, next) => {
    repo
      .updateTask(req.params['id'] as string, req.body as PatchTaskInput)
      .then((row) => res.json(toTask(row)))
      .catch(next);
  },
);

tasksRouter.patch(
  '/:id/reorder',
  validateParams(taskIdParamsSchema),
  validateBody(reorderTaskSchema),
  (req, res, next) => {
    repo
      .reorderTask(req.params['id'] as string, req.body as ReorderTaskInput)
      .then((row) => res.json(toTask(row)))
      .catch(next);
  },
);

tasksRouter.put(
  '/:id/labels',
  validateParams(taskIdParamsSchema),
  validateBody(setTaskLabelsSchema),
  (req, res, next) => {
    repo
      .setTaskLabels(req.params['id'] as string, (req.body as SetTaskLabelsInput).labelIds)
      .then((row) => res.json(toTask(row)))
      .catch(next);
  },
);

tasksRouter.delete('/:id', validateParams(taskIdParamsSchema), (req, res, next) => {
  repo
    .deleteTask(req.params['id'] as string)
    .then(() => res.status(204).end())
    .catch(next);
});

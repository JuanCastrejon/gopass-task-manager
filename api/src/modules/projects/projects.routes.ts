import { Router } from 'express';
import { validateBody, validateParams } from '../../http/validate.js';
import { toProject, toProjectSummary } from './projects.mapper.js';
import * as repo from './projects.repository.js';
import {
  createProjectSchema,
  patchProjectSchema,
  projectIdParamsSchema,
  type CreateProjectInput,
  type PatchProjectInput,
} from './projects.schema.js';

/**
 * No hay capa de servicio en este módulo.
 *
 * La especificación la contemplaba, pero al escribirla no tenía nada que
 * hacer: no hay orquestación entre repositorios, ni transacción de varios
 * pasos, ni regla de negocio que no esté ya en el motor o en el esquema Zod.
 * Un servicio que solo reenvía la llamada al repositorio es ceremonia, y se
 * multiplica como convención. Entrará cuando exista algo que orquestar.
 *
 * El manejo de errores no se repite en cada ruta: los repositorios lanzan
 * `AppError` y el manejador central los traduce a `problem+json`. Por eso
 * basta con propagar el rechazo con `next`.
 */
export const projectsRouter = Router();

projectsRouter.get('/', (_req, res, next) => {
  repo
    .listProjects()
    .then((rows) => res.json(rows.map(toProjectSummary)))
    .catch(next);
});

projectsRouter.post('/', validateBody(createProjectSchema), (req, res, next) => {
  repo
    .createProject(req.body as CreateProjectInput)
    .then((row) => res.status(201).json(toProject(row)))
    .catch(next);
});

projectsRouter.get('/:id', validateParams(projectIdParamsSchema), (req, res, next) => {
  repo
    .findProjectById(req.params['id'] as string)
    .then((row) => res.json(toProjectSummary(row)))
    .catch(next);
});

projectsRouter.patch(
  '/:id',
  validateParams(projectIdParamsSchema),
  validateBody(patchProjectSchema),
  (req, res, next) => {
    repo
      .updateProject(req.params['id'] as string, req.body as PatchProjectInput)
      .then((row) => res.json(toProject(row)))
      .catch(next);
  },
);

projectsRouter.delete('/:id', validateParams(projectIdParamsSchema), (req, res, next) => {
  repo
    .deleteProject(req.params['id'] as string)
    // `end()` y no `send()`: una respuesta 204 no lleva cuerpo.
    .then(() => res.status(204).end())
    .catch(next);
});

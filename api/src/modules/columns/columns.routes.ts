import { Router } from 'express';
import { parsedQuery, validateBody, validateParams, validateQuery } from '../../http/validate.js';
import { toProjectColumn, toProjectColumnSummary } from './columns.mapper.js';
import * as repo from './columns.repository.js';
import {
  columnParamsSchema,
  createColumnSchema,
  deleteColumnQuerySchema,
  patchColumnSchema,
  projectScopedColumnsSchema,
  reorderColumnsSchema,
  type CreateColumnInput,
  type DeleteColumnQuery,
  type PatchColumnInput,
  type ReorderColumnsInput,
} from './columns.schema.js';

/**
 * Las columnas cuelgan del proyecto en la URL porque **no existen sin él**: la
 * relación es de composición, igual que la de las tareas al crearlas y
 * listarlas. A diferencia de las tareas, aquí también editar y borrar van
 * anidados: el identificador de columna es único, pero la comprobación de
 * pertenencia al proyecto es parte de la autorización de la operación y
 * tenerla en la ruta la hace explícita.
 */
export const projectColumnsRouter = Router({ mergeParams: true });

projectColumnsRouter.get('/', validateParams(projectScopedColumnsSchema), (req, res, next) => {
  repo
    .listColumns(req.params['projectId'] as string)
    .then((rows) => res.json(rows.map(toProjectColumnSummary)))
    .catch(next);
});

projectColumnsRouter.post(
  '/',
  validateParams(projectScopedColumnsSchema),
  validateBody(createColumnSchema),
  (req, res, next) => {
    repo
      .createColumn(req.params['projectId'] as string, req.body as CreateColumnInput)
      .then((row) => res.status(201).json(toProjectColumn(row)))
      .catch(next);
  },
);

/**
 * Reordenar va antes que `/:columnId` a propósito: Express resuelve por orden
 * de declaración, y con la ruta paramétrica delante, `PATCH /reorder` se
 * interpretaría como una columna llamada «reorder» y devolvería un 400 por
 * UUID inválido en vez de reordenar.
 */
projectColumnsRouter.patch(
  '/reorder',
  validateParams(projectScopedColumnsSchema),
  validateBody(reorderColumnsSchema),
  (req, res, next) => {
    const { columnIds } = req.body as ReorderColumnsInput;
    repo
      .reorderColumns(req.params['projectId'] as string, columnIds)
      .then(() => repo.listColumns(req.params['projectId'] as string))
      .then((rows) => res.json(rows.map(toProjectColumnSummary)))
      .catch(next);
  },
);

projectColumnsRouter.patch(
  '/:columnId',
  validateParams(columnParamsSchema),
  validateBody(patchColumnSchema),
  (req, res, next) => {
    repo
      .updateColumn(
        req.params['projectId'] as string,
        req.params['columnId'] as string,
        req.body as PatchColumnInput,
      )
      .then((row) => res.json(toProjectColumn(row)))
      .catch(next);
  },
);

projectColumnsRouter.delete(
  '/:columnId',
  validateParams(columnParamsSchema),
  validateQuery(deleteColumnQuerySchema),
  (req, res, next) => {
    const { reassignTo } = parsedQuery<typeof deleteColumnQuerySchema>(res) as DeleteColumnQuery;
    repo
      .deleteColumn(
        req.params['projectId'] as string,
        req.params['columnId'] as string,
        reassignTo,
      )
      .then(() => res.status(204).end())
      .catch(next);
  },
);

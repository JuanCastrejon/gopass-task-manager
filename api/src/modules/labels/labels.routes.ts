import { Router } from 'express';
import { parsedQuery, validateBody, validateParams, validateQuery } from '../../http/validate.js';
import { toLabel } from './labels.mapper.js';
import * as repo from './labels.repository.js';
import {
  createLabelSchema,
  deleteLabelQuerySchema,
  labelIdParamsSchema,
  patchLabelSchema,
  projectScopedParamsSchema,
  type CreateLabelInput,
  type DeleteLabelQuery,
  type PatchLabelInput,
} from './labels.schema.js';

export const projectLabelsRouter = Router({ mergeParams: true });

projectLabelsRouter.get(
  '/',
  validateParams(projectScopedParamsSchema),
  (req, res, next) => {
    repo
      .listLabels(req.params['projectId'] as string)
      .then((rows) => res.json(rows.map(toLabel)))
      .catch(next);
  },
);

projectLabelsRouter.post(
  '/',
  validateParams(projectScopedParamsSchema),
  validateBody(createLabelSchema),
  (req, res, next) => {
    repo
      .createLabel(req.params['projectId'] as string, req.body as CreateLabelInput)
      .then((row) => res.status(201).json(toLabel(row)))
      .catch(next);
  },
);

export const labelsRouter = Router();

labelsRouter.patch(
  '/:id',
  validateParams(labelIdParamsSchema),
  validateBody(patchLabelSchema),
  (req, res, next) => {
    repo
      .updateLabel(req.params['id'] as string, req.body as PatchLabelInput)
      .then((row) => res.json(toLabel(row)))
      .catch(next);
  },
);

labelsRouter.delete(
  '/:id',
  validateParams(labelIdParamsSchema),
  validateQuery(deleteLabelQuerySchema),
  (req, res, next) => {
    const query = parsedQuery<typeof deleteLabelQuerySchema>(res) as DeleteLabelQuery;
    repo
      .deleteLabel(req.params['id'] as string, query.confirm ?? false)
      .then(() => res.status(204).end())
      .catch(next);
  },
);

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';

/**
 * La API es la frontera de confianza: nada entra a la capa de dominio sin
 * pasar por un esquema.
 *
 * El resultado parseado reemplaza al original, así que los controladores
 * trabajan con datos ya tipados y normalizados, no con `unknown`.
 */
export function validateBody<S extends ZodTypeAny>(schema: S): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return next(result.error);
    req.body = result.data as unknown;
    next();
  };
}

export function validateParams<S extends ZodTypeAny>(schema: S): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) return next(result.error);
    Object.assign(req.params, result.data as object);
    next();
  };
}

/**
 * La query se valida sin reasignar `req.query`: en Express 5 es un getter de
 * solo lectura. El valor parseado viaja en `res.locals.query`, de donde lo
 * lee el controlador con `parsedQuery()`.
 */
export function validateQuery<S extends ZodTypeAny>(schema: S): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) return next(result.error);
    res.locals['query'] = result.data;
    next();
  };
}

export function parsedQuery<S extends ZodTypeAny>(res: Response): z.infer<S> {
  return res.locals['query'] as z.infer<S>;
}

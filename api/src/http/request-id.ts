import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

/**
 * Identificador de correlación entre la respuesta que ve el cliente y la
 * línea de log del servidor.
 *
 * Se genera **siempre** en el servidor. Se descartó aceptar un `X-Request-Id`
 * entrante: aquí nadie está delante de la API poniendo uno, y reflejar una
 * cabecera del cliente en la respuesta y en los logs obligaría a validar
 * formato, longitud y caracteres de control para no permitir inyección de
 * líneas en el log. Es coste sin beneficio en este alcance.
 *
 * Se devuelve en **todas** las respuestas, no solo en los 500: si solo
 * apareciera al fallar, no serviría para correlacionar el caso en el que un
 * 200 devolvió algo inesperado.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  req.requestId = randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

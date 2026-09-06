import express, { type Express } from 'express';
import { pingDatabase } from './db/pool.js';
import { errorHandler, notFoundHandler } from './http/error-handler.js';
import { requestId } from './http/request-id.js';
import { projectColumnsRouter } from './modules/columns/columns.routes.js';
import { projectsRouter } from './modules/projects/projects.routes.js';
import { statsRouter } from './modules/stats/stats.routes.js';
import { projectTasksRouter, tasksRouter } from './modules/tasks/tasks.routes.js';
import { setupSwagger } from './docs/swagger.js';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');

  /**
   * La API siempre vive detrás de un proxy —nginx en Compose, el del hosting
   * en un despliegue—. Sin esto Express ignora `X-Forwarded-Proto` y una
   * redirección generada tras terminación TLS externa saldría como `http`.
   */
  app.set('trust proxy', 1);
  app.use(requestId);
  app.use(express.json({ limit: '128kb' }));

  /**
   * RF-15. Lo consume el `healthcheck` del servicio `api` en docker-compose,
   * así que informa del estado real de la dependencia y no solo de que el
   * proceso sigue vivo.
   */
  app.get('/api/health', async (_req, res) => {
    const database = (await pingDatabase()) ? 'up' : 'down';
    res.status(database === 'up' ? 200 : 503).json({
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      uptime: Math.round(process.uptime()),
    });
  });

  // Swagger UI en /api/docs y especificación OpenAPI en /api/docs.json
  setupSwagger(app);

  // El anidado va primero: Express evalúa en orden de registro y
  // `/api/projects/:projectId/tasks` es más específico que `/api/projects`.
  app.use('/api/projects/:projectId/columns', projectColumnsRouter);
  app.use('/api/projects/:projectId/tasks', projectTasksRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/stats', statsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

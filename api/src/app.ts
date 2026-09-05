import express, { type Express } from 'express';
import { pingDatabase } from './db/pool.js';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '128kb' }));

  /**
   * RF-15. Es lo que consume el `healthcheck` del servicio `api` en
   * docker-compose, así que informa del estado real de la dependencia,
   * no solo de que el proceso sigue vivo.
   */
  app.get('/api/health', async (_req, res) => {
    const database = (await pingDatabase()) ? 'up' : 'down';
    res.status(database === 'up' ? 200 : 503).json({
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      uptime: Math.round(process.uptime()),
    });
  });

  return app;
}

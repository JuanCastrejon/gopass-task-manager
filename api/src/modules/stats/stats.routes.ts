import { Router } from 'express';
import { pool } from '../../db/pool.js';

export interface Stats {
  projects: number;
  tasks: number;
  done: number;
  progress: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
}

/**
 * Un solo viaje a la base para todo el panel, en lugar de que el frontend se
 * descargue proyectos y tareas y cuente en JavaScript. Es la diferencia entre
 * "visualizar información" y "renderizar un array".
 *
 * `unnest(enum_range(NULL::task_status))` recorre los valores declarados del
 * tipo, así que un estado sin tareas aparece con `0` en vez de faltar. Una
 * clave ausente obligaría a cada consumidor a saberse el dominio y a
 * defenderse con `?? 0`.
 *
 * Los `::int` no son decorativos: `COUNT` devuelve `bigint` y el driver `pg`
 * entrega los `bigint` como string para no perder precisión.
 */
const STATS_QUERY = `
  WITH totals AS (
    SELECT
      (SELECT COUNT(*)::int FROM projects)                          AS projects,
      (SELECT COUNT(*)::int FROM tasks)                             AS tasks,
      (SELECT COUNT(*)::int FROM tasks WHERE status = 'DONE')       AS done
  ),
  by_status AS (
    SELECT jsonb_object_agg(s.value::text, s.amount) AS value
    FROM (
      SELECT e.value, COUNT(t.id)::int AS amount
      FROM unnest(enum_range(NULL::task_status)) AS e(value)
      LEFT JOIN tasks t ON t.status = e.value
      GROUP BY e.value
    ) s
  ),
  by_priority AS (
    SELECT jsonb_object_agg(p.value::text, p.amount) AS value
    FROM (
      SELECT e.value, COUNT(t.id)::int AS amount
      FROM unnest(enum_range(NULL::task_priority)) AS e(value)
      LEFT JOIN tasks t ON t.priority = e.value
      GROUP BY e.value
    ) p
  )
  SELECT totals.projects,
         totals.tasks,
         totals.done,
         CASE WHEN totals.tasks = 0 THEN 0
              ELSE ROUND(totals.done::numeric * 100 / totals.tasks)::int
         END                     AS progress,
         by_status.value         AS "byStatus",
         by_priority.value       AS "byPriority"
  FROM totals CROSS JOIN by_status CROSS JOIN by_priority
`;

export const statsRouter = Router();

statsRouter.get('/', (_req, res, next) => {
  pool
    .query<Stats>(STATS_QUERY)
    .then((result) => res.json(result.rows[0]))
    .catch(next);
});

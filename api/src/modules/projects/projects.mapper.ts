/**
 * Único punto donde `snake_case` de PostgreSQL se convierte en `camelCase`
 * del borde HTTP. Ninguna de las dos convenciones se filtra a la otra.
 */

import type { TaskPriority } from '../tasks/tasks.schema.js';

export interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  wip_limit: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface ProjectSummaryRow extends ProjectRow {
  task_count: number;
  done_count: number;
  in_progress_count: number;
  low_count: number;
  medium_count: number;
  high_count: number;
  progress: number;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  /** Máximo de tareas simultáneas en curso. `null` es «sin límite». */
  wipLimit: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSummary extends Project {
  taskCount: number;
  doneCount: number;
  /** Cuántas tareas hay ahora mismo en curso. Es el numerador del límite. */
  inProgressCount: number;
  /**
   * Cuántas tareas de cada prioridad tiene el proyecto. Las tres claves están
   * siempre presentes, también cuando valen 0: un consumidor no debería tener
   * que saberse el dominio ni defenderse con `?? 0` para pintar el desglose.
   *
   * En la base son tres columnas y aquí un objeto: la forma del contrato no
   * tiene por qué copiar la del agregado, y el listado y el detalle comparten
   * la misma consulta, así que ambos lo devuelven.
   */
  byPriority: Record<TaskPriority, number>;
  progress: number;
}

export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    wipLimit: row.wip_limit,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function toProjectSummary(row: ProjectSummaryRow): ProjectSummary {
  return {
    ...toProject(row),
    taskCount: row.task_count,
    doneCount: row.done_count,
    inProgressCount: row.in_progress_count,
    byPriority: {
      LOW: row.low_count,
      MEDIUM: row.medium_count,
      HIGH: row.high_count,
    },
    progress: row.progress,
  };
}

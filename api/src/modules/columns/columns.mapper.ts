/**
 * Único punto donde `snake_case` de PostgreSQL se convierte en `camelCase`
 * del borde HTTP, igual que en los demás módulos.
 */

import type { TaskStatus } from '../tasks/tasks.schema.js';
import type { ColumnSort } from './columns.schema.js';

export interface ProjectColumnRow {
  id: string;
  project_id: string;
  name: string;
  category: TaskStatus;
  position: number;
  wip_limit: number | null;
  sort: ColumnSort;
  created_at: Date;
  updated_at: Date;
}

/** Fila con el recuento de tareas, que solo devuelve el listado. */
export interface ProjectColumnSummaryRow extends ProjectColumnRow {
  task_count: number;
}

export interface ProjectColumn {
  id: string;
  projectId: string;
  name: string;
  /**
   * Categoría de ciclo de vida. Varias columnas pueden compartirla: «En
   * revisión» y «QA» son ambas `IN_PROGRESS`.
   *
   * Es lo que permite que `/stats` siga agregando entre proyectos con
   * columnas distintas, y de lo que dependen el `CHECK` de `completedAt` y su
   * trigger. Es el mismo modelo de categorías de estado de Jira.
   */
  category: TaskStatus;
  position: number;
  /** Máximo de tareas simultáneas. `null` es «sin límite». Nunca en una columna terminal. */
  wipLimit: number | null;
  /** Criterio de orden de las tareas dentro de la columna. Compartido por el equipo. */
  sort: ColumnSort;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectColumnSummary extends ProjectColumn {
  taskCount: number;
}

export function toProjectColumn(row: ProjectColumnRow): ProjectColumn {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    category: row.category,
    position: row.position,
    wipLimit: row.wip_limit,
    sort: row.sort,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function toProjectColumnSummary(row: ProjectColumnSummaryRow): ProjectColumnSummary {
  return { ...toProjectColumn(row), taskCount: row.task_count };
}

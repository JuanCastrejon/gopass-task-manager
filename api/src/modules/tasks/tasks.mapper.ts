import type { TaskPriority, TaskStatus } from './tasks.schema.js';

export interface TaskRow {
  id: string;
  project_id: string;
  column_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  position: number;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface Task {
  id: string;
  projectId: string;
  /** Columna del tablero en la que vive. Su categoría es siempre `status`. */
  columnId: string;
  title: string;
  description: string | null;
  status: TaskRow['status'];
  priority: TaskRow['priority'];
  /** Posición de ordenación manual dentro de la columna. */
  position: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    projectId: row.project_id,
    columnId: row.column_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    position: Number(row.position),
    completedAt: row.completed_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export interface TaskRow {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE';
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskRow['status'];
  priority: TaskRow['priority'];
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    completedAt: row.completed_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * Contratos que el frontend consume de la API.
 *
 * Escritos a mano y no generados: son cinco formas y generarlas exigiría una
 * herramienta más en el proyecto. Están junto al cliente HTTP y su fuente de
 * verdad es `docs/spec/03-contrato-api.md`; las pruebas de integración del
 * backend son las que garantizan que la API responde así.
 */

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export const TASK_STATUSES: readonly TaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE'];
export const TASK_PRIORITIES: readonly TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH'];

export interface Project {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSummary extends Project {
  taskCount: number;
  doneCount: number;
  /**
   * Cuántas tareas de cada prioridad tiene el proyecto. Las tres claves llegan
   * siempre, también en 0, así que el filtro del panel puede preguntar
   * `byPriority[p] > 0` sin defenderse de una clave ausente.
   */
  byPriority: Record<TaskPriority, number>;
  progress: number;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  /** Lo sella la base en la transición a DONE. La API rechaza escribirlo. */
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string | null;
}

export interface PatchProjectInput {
  name?: string;
  description?: string | null;
}

export interface Stats {
  projects: number;
  tasks: number;
  done: number;
  progress: number;
  byStatus: Record<TaskStatus, number>;
  byPriority: Record<TaskPriority, number>;
}

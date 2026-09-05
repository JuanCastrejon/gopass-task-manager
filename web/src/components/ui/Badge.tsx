import type { TaskPriority, TaskStatus } from '../../types/api.ts';

export const STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: 'Por hacer',
  IN_PROGRESS: 'En curso',
  DONE: 'Completada',
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  LOW: 'Baja',
  MEDIUM: 'Media',
  HIGH: 'Alta',
};

const PRIORITY_STYLE: Record<TaskPriority, string> = {
  LOW: 'bg-priority-low-soft text-priority-low',
  MEDIUM: 'bg-priority-medium-soft text-priority-medium',
  HIGH: 'bg-priority-high-soft text-priority-high',
};

const STATUS_DOT: Record<TaskStatus, string> = {
  TODO: 'bg-status-todo',
  IN_PROGRESS: 'bg-status-progress',
  DONE: 'bg-status-done',
};

/**
 * La prioridad se distingue por color **y** por texto. Solo por color dejaría
 * fuera a quien no discrimina rojo de verde, que es en torno al 8 % de los
 * hombres.
 */
export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${PRIORITY_STYLE[priority]}`}
    >
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

export function StatusDot({ status }: { status: TaskStatus }) {
  return (
    <span
      aria-hidden
      className={`inline-block size-2 shrink-0 rounded-full ${STATUS_DOT[status]}`}
    />
  );
}

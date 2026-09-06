import type { TaskPriority, TaskStatus } from '../../types/api.ts';
import { calcularEstadoVencimiento } from '../../features/tasks/due-date.ts';

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
 *
 * Con `count` la misma píldora sirve de desglose en la tarjeta de proyecto: el
 * número explica por qué un chip de prioridad esconde ese proyecto. Sin el
 * desglose el filtro sería opaco —las tarjetas desaparecerían sin motivo
 * visible—, y con un componente aparte habría dos vocabularios de color para
 * la misma idea.
 */
export function PriorityBadge({
  priority,
  count,
}: {
  priority: TaskPriority;
  count?: number;
}) {
  const etiqueta = PRIORITY_LABEL[priority];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${PRIORITY_STYLE[priority]}`}
      // El texto visible queda en «Alta 2», que fuera de contexto no dice de
      // qué son esos 2. El nombre accesible sí lo dice.
      {...(count !== undefined
        ? { 'aria-label': `${etiqueta}: ${count} ${count === 1 ? 'tarea' : 'tareas'}` }
        : {})}
    >
      <span aria-hidden={count !== undefined}>{etiqueta}</span>
      {count !== undefined && (
        <span aria-hidden className="tabular-nums font-semibold">
          {count}
        </span>
      )}
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

/**
 * Insignia de fecha de vencimiento (SL-17).
 *
 * Siempre visible cuando la tarea tenga fecha, no solo cuando urge.
 * La completada gana siempre, atenuando la insignia y dejando de alarmar.
 * Nunca solo color: incluye texto con el estado y etiqueta accesible completa.
 */
export function DueDateBadge({
  dueDate,
  isDone,
}: {
  dueDate: string | null | undefined;
  isDone: boolean;
}) {
  if (!dueDate) return null;
  const info = calcularEstadoVencimiento(dueDate, isDone);
  if (info.status === 'sin_fecha') return null;

  return (
    <span
      data-testid="due-date-badge"
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors ${info.className}`}
      aria-label={info.ariaLabel}
    >
      {info.label}
    </span>
  );
}

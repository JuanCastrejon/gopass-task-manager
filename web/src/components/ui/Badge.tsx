import type { Label, LabelColor, TaskPriority, TaskStatus } from '../../types/api.ts';
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

/**
 * Mapeo explícito de clases para las 12 fichas de color semánticas.
 * Cada par garantiza contraste >= 4.5:1 (WCAG AA).
 */
export const LABEL_STYLE: Record<LabelColor, string> = {
  slate: 'bg-label-slate-soft text-label-slate',
  red: 'bg-label-red-soft text-label-red',
  orange: 'bg-label-orange-soft text-label-orange',
  amber: 'bg-label-amber-soft text-label-amber',
  yellow: 'bg-label-yellow-soft text-label-yellow',
  green: 'bg-label-green-soft text-label-green',
  teal: 'bg-label-teal-soft text-label-teal',
  cyan: 'bg-label-cyan-soft text-label-cyan',
  blue: 'bg-label-blue-soft text-label-blue',
  indigo: 'bg-label-indigo-soft text-label-indigo',
  purple: 'bg-label-purple-soft text-label-purple',
  pink: 'bg-label-pink-soft text-label-pink',
};

/**
 * Píldora individual de etiqueta (SL-18).
 * Trunca el texto si supera el ancho máximo con puntos suspensivos y muestra
 * el nombre íntegro en `title` para no perder legibilidad ni accesibilidad.
 */
export function LabelBadge({
  label,
  className = '',
}: {
  label: Pick<Label, 'name' | 'color'>;
  className?: string;
}) {
  return (
    <span
      data-testid="label-badge"
      title={label.name}
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium max-w-[120px] truncate ${LABEL_STYLE[label.color] ?? 'bg-canvas text-ink-muted'} ${className}`}
    >
      <span className="truncate">{label.name}</span>
    </span>
  );
}

/**
 * Grupo de píldoras de etiqueta en la tarjeta de tarea (SL-18).
 *
 * Muestra hasta 2 etiquetas visibles para no saturar visualmente el tablero.
 * Si hay más de 2, agrega una insignia `+N` accesible cuyo `aria-label` y `title`
 * enumeran los nombres completos de las etiquetas restantes.
 */
export function LabelPills({ labels }: { labels?: Label[] }) {
  if (!labels || labels.length === 0) return null;

  const visibles = labels.slice(0, 2);
  const restantes = labels.slice(2);
  const nombresRestantes = restantes.map((l) => l.name).join(', ');

  return (
    <div className="flex flex-wrap items-center gap-1" data-testid="label-pills">
      {visibles.map((label) => (
        <LabelBadge key={label.id} label={label} />
      ))}
      {restantes.length > 0 && (
        <span
          data-testid="label-more-badge"
          aria-label={nombresRestantes}
          title={nombresRestantes}
          className="inline-flex items-center rounded border border-border bg-canvas px-1.5 py-0.5 text-[11px] font-medium text-ink-muted"
        >
          +{restantes.length}
        </span>
      )}
    </div>
  );
}


import { useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, Pencil, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button.tsx';
import { PriorityBadge, STATUS_LABEL } from '../../components/ui/Badge.tsx';
import type { Task, TaskStatus } from '../../types/api.ts';

const SIGUIENTE: Partial<Record<TaskStatus, TaskStatus>> = {
  TODO: 'IN_PROGRESS',
  IN_PROGRESS: 'DONE',
};
const ANTERIOR: Partial<Record<TaskStatus, TaskStatus>> = {
  IN_PROGRESS: 'TODO',
  DONE: 'IN_PROGRESS',
};

interface Props {
  task: Task;
  pending: boolean;
  /** Devuelve el foco tras un movimiento: la tarjeta se remonta en otra columna. */
  autoFocus: boolean;
  onMove: (status: TaskStatus) => void;
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * El cambio de estado se hace con flechas y no con un `<select>`.
 *
 * La columna ya dice cuál es el estado actual, así que un desplegable que lo
 * repita es información redundante ocupando el ancho de una tarjeta estrecha.
 * Lo que no es redundante es la **transición**, y eso es justo lo que
 * comunican las flechas, en un solo clic y sin abrir nada encima.
 */
export function TaskCard({ task, pending, autoFocus, onMove, onEdit, onDelete }: Props) {
  const anterior = ANTERIOR[task.status];
  const siguiente = SIGUIENTE[task.status];
  const focusRef = useRef<HTMLDivElement>(null);

  // Al moverse, la tarjeta se desmonta de una columna y se monta en otra: el
  // botón que tenía el foco desaparece y el foco se caería al `body`, dejando
  // a quien navega con teclado sin punto de referencia.
  useEffect(() => {
    if (autoFocus) focusRef.current?.focus();
  }, [autoFocus]);

  return (
    <article
      ref={focusRef}
      tabIndex={-1}
      aria-busy={pending || undefined}
      className={`rounded-lg border border-border bg-surface p-3 transition
        ${pending ? 'pointer-events-none opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className={`text-sm ${task.status === 'DONE' ? 'text-ink-muted line-through' : ''}`}>
          {task.title}
        </h4>
        <div className="flex shrink-0 gap-0.5 pointer-coarse:gap-1">
          <Button variant="ghost" size="sm" className="size-7 px-0 pointer-coarse:size-11" onClick={onEdit} aria-label={`Editar ${task.title}`}>
            <Pencil className="size-3" aria-hidden />
          </Button>
          <Button variant="ghost" size="sm" className="size-7 px-0 pointer-coarse:size-11" onClick={onDelete} aria-label={`Eliminar ${task.title}`}>
            <Trash2 className="size-3" aria-hidden />
          </Button>
        </div>
      </div>

      {task.description && (
        <p className="mt-1 line-clamp-2 text-xs text-ink-muted">{task.description}</p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2">
        {anterior ? (
          <Button
            variant="ghost"
            size="sm"
            className="size-7 px-0 pointer-coarse:size-11"
            onClick={() => onMove(anterior)}
            aria-label={`Mover "${task.title}" a ${STATUS_LABEL[anterior]}`}
          >
            <ArrowLeft className="size-3.5" aria-hidden />
          </Button>
        ) : (
          <span className="size-7 pointer-coarse:size-11" />
        )}

        <PriorityBadge priority={task.priority} />

        {siguiente ? (
          <Button
            variant="ghost"
            size="sm"
            className="size-7 px-0 pointer-coarse:size-11"
            onClick={() => onMove(siguiente)}
            aria-label={`Mover "${task.title}" a ${STATUS_LABEL[siguiente]}`}
          >
            <ArrowRight className="size-3.5" aria-hidden />
          </Button>
        ) : (
          <span className="size-7 pointer-coarse:size-11" />
        )}
      </div>
    </article>
  );
}

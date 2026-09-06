import { useEffect, useRef, type SyntheticEvent } from 'react';
import { useDraggable } from '@dnd-kit/core';
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

/**
 * Los controles viven DENTRO de la superficie arrastrable, así que hay que
 * impedir que el sensor tome el gesto antes de que el botón reciba su clic.
 * Se detiene en fase de captura —antes de que el evento llegue al `<article>`—
 * y en los tres tipos, porque el navegador elige uno u otro según el
 * dispositivo.
 */
const SIN_ARRASTRE = {
  onPointerDownCapture: (e: SyntheticEvent) => e.stopPropagation(),
  onMouseDownCapture: (e: SyntheticEvent) => e.stopPropagation(),
  onTouchStartCapture: (e: SyntheticEvent) => e.stopPropagation(),
} as const;

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
  // El tipo unido, y no `useRef<HTMLElement>(null)`: con este último `current`
  // es de solo lectura y aquí hay que escribirlo desde el callback del ref.
  const focusRef = useRef<HTMLElement | null>(null);

  /**
   * Solo `listeners`: los `attributes` de dnd-kit imponen `role="button"` y
   * `tabIndex={0}`, que romperían la semántica de este `<article>` y
   * duplicarían el punto de tabulación que ya tienen las flechas. El teclado
   * no lo cubre el arrastre, lo cubren ellas (ADR-018).
   */
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: task.id,
    data: { status: task.status },
    disabled: pending,
  });

  // Al moverse, la tarjeta se desmonta de una columna y se monta en otra: el
  // botón que tenía el foco desaparece y el foco se caería al `body`, dejando
  // a quien navega con teclado sin punto de referencia.
  useEffect(() => {
    if (autoFocus) focusRef.current?.focus();
  }, [autoFocus]);

  return (
    <article
      ref={(nodo) => {
        focusRef.current = nodo;
        setNodeRef(nodo);
      }}
      tabIndex={-1}
      aria-busy={pending || undefined}
      {...listeners}
      // `touch-action` se deja en su valor normal: ponerlo en `none` mataría
      // el desplazamiento del carrusel antes de que el usuario llegue a
      // mantener pulsado. El sensor táctil solo reclama el gesto cuando se
      // cumplen sus 250 ms.
      className={`select-none rounded-lg border border-border bg-surface p-3 transition
        ${isDragging ? 'opacity-40' : ''}
        ${pending ? 'pointer-events-none opacity-60' : 'cursor-grab active:cursor-grabbing'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className={`text-sm ${task.status === 'DONE' ? 'text-ink-muted line-through' : ''}`}>
          {task.title}
        </h4>
        <div className="flex shrink-0 gap-0.5 pointer-coarse:gap-1" {...SIN_ARRASTRE}>
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

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2" {...SIN_ARRASTRE}>
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

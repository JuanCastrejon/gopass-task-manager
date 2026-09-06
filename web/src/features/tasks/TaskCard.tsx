import { useEffect, useRef, type CSSProperties, type SyntheticEvent } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowLeft, ArrowRight, Pencil, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button.tsx';
import { PriorityBadge } from '../../components/ui/Badge.tsx';
import type { ProjectColumnSummary, Task } from '../../types/api.ts';

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
  /**
   * Columnas contiguas, calculadas por posición en el tablero.
   *
   * Antes eran un mapa fijo de tres estados. Con columnas configurables la
   * transición contigua deja de ser una constante del dominio y pasa a
   * depender del tablero concreto, así que la calcula quien lo conoce.
   */
  anterior: ProjectColumnSummary | null;
  siguiente: ProjectColumnSummary | null;
  onMove: (columnId: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * El cambio de columna se hace con flechas y no con un `<select>` por tarjeta.
 *
 * La columna ya dice dónde está la tarea, así que un desplegable que lo repita
 * es información redundante ocupando el ancho de una tarjeta estrecha. Lo que
 * no es redundante es la **transición**, y eso es lo que comunican las flechas,
 * en un solo clic y sin abrir nada encima.
 *
 * Con N columnas siguen bastando para **WCAG 2.2 SC 2.5.7**: se llega a
 * cualquier columna paso a paso sin arrastrar. Para el salto directo está el
 * desplegable del diálogo de edición, que no roba sitio en la tarjeta.
 */
export function TaskCard({
  task,
  pending,
  autoFocus,
  anterior,
  siguiente,
  onMove,
  onEdit,
  onDelete,
}: Props) {
  // El tipo unido, y no `useRef<HTMLElement>(null)`: con este último `current`
  // es de solo lectura y aquí hay que escribirlo desde el callback del ref.
  const focusRef = useRef<HTMLElement | null>(null);

  /**
   * Solo `listeners`: los `attributes` de dnd-kit imponen `role="button"` y
   * `tabIndex={0}`, que romperían la semántica de este `<article>` y
   * duplicarían el punto de tabulación que ya tienen las flechas. El teclado
   * no lo cubre el arrastre, lo cubren ellas (ADR-018).
   *
   * `useSortable` aporta además `transform` y `transition` para que las tarjetas
   * contiguas se deslicen suavemente abriendo hueco al arrastrar dentro de una columna.
   */
  const { setNodeRef, listeners, isDragging, transform, transition } = useSortable({
    id: task.id,
    data: { status: task.status, columnId: task.columnId },
    disabled: pending,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

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
      style={style}
      tabIndex={-1}
      aria-busy={pending || undefined}
      {...listeners}
      // `touch-action` se deja en su valor normal: ponerlo en `none` mataría
      // el desplazamiento del carrusel antes de que el usuario llegue a
      // mantener pulsado. El sensor táctil solo reclama el gesto cuando se
      // cumplen sus 250 ms.
      className={`select-none rounded-lg border border-border bg-surface p-3 transition-colors
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
            onClick={() => onMove(anterior.id)}
            aria-label={`Mover "${task.title}" a ${anterior.name}`}
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
            onClick={() => onMove(siguiente.id)}
            aria-label={`Mover "${task.title}" a ${siguiente.name}`}
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

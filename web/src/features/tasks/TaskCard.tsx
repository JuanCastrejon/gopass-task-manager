import { useEffect, useRef, useState, type CSSProperties, type SyntheticEvent } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowLeft, ArrowRight, Check, Pencil, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button.tsx';
import { DueDateBadge, PriorityBadge } from '../../components/ui/Badge.tsx';
import type { ProjectColumnSummary, Task } from '../../types/api.ts';

/**
 * Los controles viven DENTRO de la superficie arrastrable, así que hay que
 * impedir que el sensor tome el gesto antes de que el botón reciba su clic.
 * Se detiene en fase de captura —antes de que el evento llegue al `<article>`—
 * y en los tres tipos, porque el navegador elige uno u otro según el
 * dispositivo.
 *
 * No se añade `preventDefault` indiscriminado: rompería la activación por teclado.
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
  /**
   * Columnas de categoría DONE del proyecto.
   *
   * Si hay una sola, completar la tarea la mueve directamente a ella.
   * Si hay más de una, se despliega un menú accesible para que el usuario elija
   * el destino explícitamente sin reglas ocultas ni selecciones arbitrarias (SL-16).
   */
  columnasDone?: ProjectColumnSummary[];
  onMove: (columnId: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * Decisión de diseño: Indicador de estado vs Botón de desmarcar en tareas completadas.
 *
 * En una tarea ya completada, el círculo pasa a ser indicador de estado, no un botón.
 * Verde y relleno, como la insignia de prioridad: informa, no se pulsa.
 *
 * Por qué el indicador y no un botón que desmarque, que es donde los dos revisores discreparon:
 * el camino de vuelta ya existe y ya es un solo clic. Una tarjeta en «Completada» tiene la
 * flecha izquierda que la mueve a la columna contigua anterior, con su etiqueta diciendo a cuál.
 * Un menú de reapertura costaría dos clics más gestión de foco para duplicar algo que ya está; y un
 * círculo pulsable que no hace nada sería peor que un indicador honesto.
 */
export function TaskCard({
  task,
  pending,
  autoFocus,
  anterior,
  siguiente,
  columnasDone = [],
  onMove,
  onEdit,
  onDelete,
}: Props) {
  // El tipo unido, y no `useRef<HTMLElement>(null)`: con este último `current`
  // es de solo lectura y aquí hay que escribirlo desde el callback del ref.
  const focusRef = useRef<HTMLElement | null>(null);

  const esCompletada = task.status === 'DONE';
  const hayVariosDestinos = columnasDone.length > 1;
  const destinoUnico = columnasDone[0] ?? null;

  const [menuAbierto, setMenuAbierto] = useState(false);
  const botonCompletarRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const itemsMenuRef = useRef<(HTMLButtonElement | null)[]>([]);

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
  // a quien navega con teclado sin punto de referencia. Se busca por su id
  // en el DOM vivo para no retener un nodo anterior desmontado.
  useEffect(() => {
    if (autoFocus) {
      const nodo = document.getElementById(`task-${task.id}`) ?? focusRef.current;
      nodo?.focus();
    }
  }, [autoFocus, task.id]);

  // Al abrir el menú de destinos, el foco viaja automáticamente al primer elemento.
  useEffect(() => {
    if (menuAbierto) {
      itemsMenuRef.current[0]?.focus();
    }
  }, [menuAbierto]);

  // Cerrar el menú si se hace clic o toque fuera del control.
  useEffect(() => {
    if (!menuAbierto) return;

    function alPulsarFuera(evento: MouseEvent | TouchEvent) {
      const target = evento.target as Node | null;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        botonCompletarRef.current &&
        !botonCompletarRef.current.contains(target)
      ) {
        setMenuAbierto(false);
      }
    }

    document.addEventListener('mousedown', alPulsarFuera);
    document.addEventListener('touchstart', alPulsarFuera);
    return () => {
      document.removeEventListener('mousedown', alPulsarFuera);
      document.removeEventListener('touchstart', alPulsarFuera);
    };
  }, [menuAbierto]);

  function alPulsarCompletar() {
    if (hayVariosDestinos) {
      setMenuAbierto((prev) => !prev);
    } else if (destinoUnico) {
      onMove(destinoUnico.id);
    }
  }

  function manejarTecladoMenu(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setMenuAbierto(false);
      botonCompletarRef.current?.focus();
      return;
    }

    const cantidad = columnasDone.length;
    if (cantidad === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const indiceActual = itemsMenuRef.current.findIndex((el) => el === document.activeElement);
      const siguiente = indiceActual === -1 ? 0 : (indiceActual + 1) % cantidad;
      itemsMenuRef.current[siguiente]?.focus();
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const indiceActual = itemsMenuRef.current.findIndex((el) => el === document.activeElement);
      const anterior = indiceActual === -1 ? cantidad - 1 : (indiceActual - 1 + cantidad) % cantidad;
      itemsMenuRef.current[anterior]?.focus();
      return;
    }

    if (e.key === 'Tab') {
      setMenuAbierto(false);
    }
  }

  const etiquetaCompletar = hayVariosDestinos
    ? `Completar "${task.title}": elegir columna`
    : destinoUnico
      ? `Completar "${task.title}": mover a ${destinoUnico.name}`
      : `Completar "${task.title}"`;

  return (
    <article
      id={`task-${task.id}`}
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
        <div className="flex min-w-0 flex-1 items-start gap-1.5">
          {esCompletada ? (
            /*
             * Tarea YA completada: el círculo pasa a ser indicador de estado, no un botón.
             * Verde y relleno, como la insignia de prioridad: informa, no se pulsa.
             * No es un punto de tabulación (no interactivo), y se dota de texto accesible.
             */
            <span
              className="flex size-7 shrink-0 items-center justify-center pointer-coarse:size-11"
              {...SIN_ARRASTRE}
            >
              <span className="flex size-4.5 shrink-0 items-center justify-center rounded-full bg-status-done text-white shadow-xs">
                <Check className="size-2.5 stroke-[3]" aria-hidden />
              </span>
              <span className="sr-only">Completada</span>
            </span>
          ) : (
            /*
             * Tarea NO completada: es un botón convencional (<button type="button">),
             * NUNCA role="checkbox" ni aria-pressed. Los dos revisores coincidieron y la
             * razón es semántica: la acción traslada la tarjeta a otro contenedor, no
             * conmuta una propiedad local. Prometer una casilla a quien no ve la pantalla
             * sería mentirle.
             */
            <div className="relative flex shrink-0 items-center" {...SIN_ARRASTRE}>
              <button
                ref={botonCompletarRef}
                type="button"
                disabled={pending}
                aria-label={etiquetaCompletar}
                {...(hayVariosDestinos
                  ? { 'aria-haspopup': 'menu', 'aria-expanded': menuAbierto }
                  : {})}
                onClick={alPulsarCompletar}
                className="group flex size-7 shrink-0 items-center justify-center rounded-lg text-ink-muted transition hover:text-status-done focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none pointer-coarse:size-11"
              >
                <span className="flex size-4.5 shrink-0 items-center justify-center rounded-full border-2 border-ink-muted/40 transition group-hover:border-status-done group-hover:bg-status-done/10">
                  <Check className="size-2.5 stroke-[3] text-status-done opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                </span>
              </button>

              {menuAbierto && hayVariosDestinos && (
                <div
                  ref={menuRef}
                  role="menu"
                  aria-label={`Destinos para completar "${task.title}"`}
                  onKeyDown={manejarTecladoMenu}
                  className="absolute left-0 top-full z-20 mt-1 min-w-[12rem] rounded-lg border border-border bg-surface p-1 shadow-lg"
                >
                  <p className="px-2 py-1 text-[11px] font-medium text-ink-muted">
                    Mover a columna:
                  </p>
                  {columnasDone.map((col, indice) => (
                    <button
                      key={col.id}
                      ref={(el) => {
                        itemsMenuRef.current[indice] = el;
                      }}
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium text-ink transition hover:bg-canvas focus:bg-canvas focus:outline-none"
                      onClick={() => {
                        setMenuAbierto(false);
                        onMove(col.id);
                      }}
                    >
                      <span className="size-2 shrink-0 rounded-full bg-status-done" aria-hidden />
                      <span className="truncate">{col.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <h4
            className={`min-w-0 pt-1 break-words text-sm ${
              task.status === 'DONE' ? 'text-ink-muted line-through' : ''
            }`}
          >
            {task.title}
          </h4>
        </div>

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

        <div className="flex items-center gap-1.5 flex-wrap justify-center min-w-0">
          <PriorityBadge priority={task.priority} />
          <DueDateBadge dueDate={task.dueDate} isDone={esCompletada} />
        </div>

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

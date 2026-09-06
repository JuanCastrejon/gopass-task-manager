import { useRef, useState, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Columns3, Plus } from 'lucide-react';
import { Button } from '../../components/ui/Button.tsx';
import { ErrorState, Skeleton } from '../../components/ui/States.tsx';
import { StatusDot } from '../../components/ui/Badge.tsx';
import { CampoBusqueda, GrupoDePrioridad } from '../../components/ui/Filtros.tsx';
import { messageFor } from '../../lib/error-messages.ts';
import { useFiltrosDeUrl } from '../../lib/use-filtros-de-url.ts';
import {
  COLUMN_SORTS,
  COLUMN_SORT_LABEL,
  type ColumnSort,
  type ProjectColumnSummary,
  type Task,
} from '../../types/api.ts';
import { useUpdateColumn } from '../columns/api.ts';
import { ColumnManagerDialog } from '../columns/ColumnManagerDialog.tsx';
import { TaskCard } from './TaskCard.tsx';
import { TaskFormDialog } from './TaskFormDialog.tsx';
import { useDeleteTask, useTasks, useUpdateTask } from './api.ts';

export function TaskBoard({
  projectId,
  columnas,
}: {
  projectId: string;
  /**
   * Las columnas del tablero, ya ordenadas por posición.
   *
   * Antes eran la constante `TASK_STATUSES`: tres, fijas y globales. Ahora son
   * datos del proyecto, así que el tablero deja de conocer su propia forma y
   * la recibe.
   */
  columnas: ProjectColumnSummary[];
}) {
  /**
   * Los filtros viven en la URL, no en `useState`: así el tablero filtrado
   * sobrevive a una recarga y se puede compartir por enlace. El hook los
   * comparte con el panel de proyectos, incluido el retardo y la lectura de
   * `window.location` dentro del temporizador que evita que un chip recién
   * pulsado se desmarque solo.
   *
   * **No hay filtro por estado**, y es deliberado: las tres columnas ya SON la
   * dimensión de estado. Filtrar por `DONE` dejaría dos columnas vacías y el
   * tablero parecería roto en vez de filtrado.
   */
  const { busqueda, setBusqueda, busquedaUrl, prioridad, cambiarPrioridad, hayFiltro } =
    useFiltrosDeUrl();

  // Aquí se filtra en el servidor y por eso se consulta con `busquedaUrl`, ya
  // retardada: una colección de tareas puede crecer sin techo y `q` viaja al
  // `ILIKE`. En el panel de proyectos la decisión es la contraria.
  const tareas = useTasks(projectId, {
    ...(busquedaUrl ? { q: busquedaUrl } : {}),
    ...(prioridad ? { priority: [prioridad] } : {}),
  });

  const mover = useUpdateTask();
  const borrar = useDeleteTask();

  const [creandoEn, setCreandoEn] = useState<ProjectColumnSummary | null>(null);
  const [gestionando, setGestionando] = useState(false);
  const cambiarColumna = useUpdateColumn(projectId);
  const [editando, setEditando] = useState<Task | null>(null);
  const [moviendoId, setMoviendoId] = useState<string | null>(null);
  const [recienMovida, setRecienMovida] = useState<string | null>(null);

  /** Tarjeta que se está arrastrando ahora mismo, para pintarla en el overlay. */
  const [arrastrada, setArrastrada] = useState<Task | null>(null);

  /**
   * Proyección del movimiento mientras la petición vuela.
   *
   * No es una escritura optimista en la caché: la caché sigue conteniendo solo
   * lo que PostgreSQL confirmó (ADR-005). Esto es estado de presentación, y
   * vive aquí porque al soltar una tarjeta tiene que quedarse donde la
   * soltaste; verla volver al origen durante 200 ms y saltar de nuevo al
   * destino rompe la sensación de manipulación directa.
   *
   * Al no haber predicción en la caché, el error no necesita rollback: basta
   * con retirar la proyección y la tarjeta reaparece donde el servidor dice.
   */
  const [proyeccion, setProyeccion] = useState<{ id: string; destino: string } | null>(null);

  const carruselRef = useRef<HTMLDivElement>(null);

  /**
   * Ratón por distancia y táctil por tiempo, que es lo que separa los dos
   * gestos: un deslizamiento rápido sigue desplazando el carrusel, y solo
   * mantener pulsado levanta la tarjeta. Sin el retardo, arrastrar y
   * desplazar competirían por el mismo movimiento del dedo.
   *
   * Sin `KeyboardSensor` a propósito: interceptaría Espacio, Enter y las
   * flechas de dirección, que son justo las teclas de los botones que ya hay
   * dentro de la tarjeta. La vía de teclado son esos botones (ADR-018).
   */
  const sensores = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  /**
   * `origen` decide el foco. Con las flechas, el botón pulsado se desmonta al
   * cambiar la tarjeta de columna y el foco caería al `body`, así que la
   * tarjeta se enfoca a sí misma (ADR-018). Con el arrastre no: el puntero no
   * ha perdido nada y robarle el foco pintaría un anillo que nadie pidió.
   */
  function moverTarea(task: Task, columnId: string, origen: 'flecha' | 'arrastre' = 'flecha'): void {
    if (moviendoId !== null) return; // reentrada por doble clic rápido
    setMoviendoId(task.id);
    if (origen === 'arrastre') setProyeccion({ id: task.id, destino: columnId });
    // Se manda `columnId` y no `status`: con varias columnas de la misma
    // categoría, solo el identificador dice a cuál va. El servidor deriva el
    // estado de la columna, porque la clave foránea compuesta los mantiene
    // unidos.
    mover.mutate(
      { id: task.id, patch: { columnId } },
      {
        onSuccess: () => {
          if (origen === 'flecha') setRecienMovida(task.id);
        },
        onSettled: () => {
          setMoviendoId(null);
          setProyeccion(null);
        },
      },
    );
  }

  function alEmpezarArrastre(evento: DragStartEvent): void {
    const task = tareas.data?.find((t) => t.id === evento.active.id);
    setArrastrada(task ?? null);
  }

  /**
   * Soltar fuera de una columna, o sobre la de origen, no dispara nada: el
   * overlay vuelve solo a su sitio con la animación de la librería. Es el
   * «se devuelve a su posición original» sin escribir una línea de física.
   */
  function alSoltar(evento: DragEndEvent): void {
    setArrastrada(null);
    const destino = evento.over?.id as string | undefined;
    if (!destino) return;

    const task = tareas.data?.find((t) => t.id === evento.active.id);
    if (!task || task.columnId === destino) return;

    // A diferencia de las flechas, que solo ofrecen la transición contigua por
    // espacio en la tarjeta, aquí se permite cualquier columna: soltar en
    // «Completada» desde «Por hacer» es un gesto deliberado, y el dominio no
    // prohíbe esa transición. El trigger sella `completed_at` igual.
    moverTarea(task, destino, 'arrastre');
  }

  /**
   * Borrar una tarea es irreversible y el icono está a dos milímetros del de
   * editar. Se confirma con el diálogo nativo del navegador y no con un modal
   * propio: estamos en feature freeze y un componente nuevo no entra.
   */
  function borrarTarea(task: Task): void {
    if (borrar.isPending) return;
    if (!window.confirm(`¿Eliminar la tarea "${task.title}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    borrar.mutate(task.id);
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* El criterio de orden se dice en voz alta. Sin esto, una tarjeta que
            aparece dos posiciones más abajo de donde se soltó parece un fallo;
            con esto es una regla que el usuario puede predecir. */}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Tareas</h2>
          <p className="text-xs text-ink-muted">
            Orden automático: prioridad alta primero, y dentro de cada prioridad, las más recientes
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <CampoBusqueda
            value={busqueda}
            onChange={setBusqueda}
            ariaLabel="Buscar tareas por título"
          />
          <GrupoDePrioridad
            valor={prioridad}
            onChange={cambiarPrioridad}
            ariaLabel="Filtrar tareas por prioridad"
          />
          <Button variant="secondary" size="sm" onClick={() => setGestionando(true)}>
            <Columns3 className="size-3.5" aria-hidden />
            Columnas
          </Button>
        </div>
      </div>

      {tareas.isError && (
        <ErrorState message={messageFor(tareas.error)} onRetry={() => void tareas.refetch()} />
      )}

      {/* Sin esto, un borrado o un movimiento que falla no produce nada
          visible: la tarjeta se queda quieta y el usuario vuelve a pulsar
          creyendo que la interfaz no responde. */}
      {(borrar.isError || mover.isError) && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {messageFor(borrar.error ?? mover.error, 'No se pudo actualizar la tarea.')}
        </p>
      )}

      {tareas.isPending && (
        <div className="grid grid-cols-1 gap-4 lg:grid-flow-col lg:auto-cols-[minmax(16rem,1fr)]">
          {columnas.map((c) => (
            <div key={c.id} className="space-y-2 rounded-xl border border-border bg-canvas/60 p-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
            </div>
          ))}
        </div>
      )}

      {tareas.data && (
        // Desplazamiento horizontal con anclaje hasta `lg`: apilar las
        // columnas convertiría el tablero en una lista larga y se perdería la
        // noción de flujo, que es justo lo que un tablero comunica.
        //
        // El umbral es `lg` (1024 px) y no `md` (768 px): en una tablet en
        // vertical, tres columnas de 234 px dejaban los títulos envueltos en
        // cuatro líneas. Con el carrusel, cada columna mide 82vw —unos 630 px
        // a 768— y se lee de un vistazo.
        <DndContext
          sensors={sensores}
          onDragStart={alEmpezarArrastre}
          onDragEnd={alSoltar}
          onDragCancel={() => setArrastrada(null)}
          // Umbral horizontal generoso: el autoscroll tiene que arrancar antes
          // de que el pulgar invada el borde de la pantalla, donde iOS y
          // Android reservan su propio gesto de «volver atrás».
          autoScroll={{ threshold: { x: 0.18, y: 0.1 }, acceleration: 8 }}
        >
          <div
            ref={carruselRef}
            role="region"
            aria-label="Tablero de tareas"
            /**
             * El anclaje se apaga mientras se arrastra. `snap-mandatory` vive
             * en el hilo del compositor: si sigue activo mientras el
             * autoscroll desplaza el carrusel, el navegador tira de vuelta
             * hacia la columna centrada y la tarjeta da saltos.
             */
            /**
             * `grid-flow-col` con `auto-cols-[minmax(16rem,1fr)]` y no
             * `grid-cols-3`: con columnas configurables el número deja de ser
             * conocido, y una rejilla de tres columnas fijas colapsaría al
             * añadir la cuarta. Así, hasta cuatro o cinco se reparten el ancho
             * y a partir de ahí el tablero se desplaza en horizontal
             * conservando 256 px legibles por columna.
             */
            className={`flex gap-4 overflow-x-auto pb-3
                       lg:grid lg:grid-flow-col lg:auto-cols-[minmax(16rem,1fr)] lg:pb-0
                       ${arrastrada ? 'snap-none' : 'snap-x snap-mandatory'}`}
          >
          {columnas.map((col, indice) => {
            // La columna que se pinta es la proyectada, no la confirmada: es lo
            // que hace que la tarjeta se quede donde la sueltas.
            const dentro = tareas.data.filter(
              (t) => (proyeccion?.id === t.id ? proyeccion.destino : t.columnId) === col.id,
            );
            // Contiguas por posición en el tablero, no por un mapa fijo de
            // estados: con columnas configurables la transición «siguiente»
            // depende de este tablero concreto.
            const anterior = columnas[indice - 1] ?? null;
            const siguiente = columnas[indice + 1] ?? null;
            return (
              // Cada columna es una región con nombre propio. Sin esto, un
              // lector de pantalla anuncia tres secciones indistinguibles y
              // los tres botones «Añadir» suenan igual.
              <ColumnaDestino key={col.id} columna={col} arrastrando={arrastrada !== null}>
                <header className="mb-2.5 flex items-center gap-2 px-0.5">
                  {/* El punto sigue el color de la CATEGORÍA, no del nombre:
                      «QA» y «En revisión» son ambas trabajo en curso y deben
                      leerse como tal de un vistazo. */}
                  <StatusDot status={col.category} />
                  <h3 className="min-w-0 truncate text-xs font-medium uppercase tracking-wide text-ink-muted" title={col.name}>
                    {col.name}
                  </h3>
                  {/*
                    El límite se muestra solo donde se declaró. Un contador
                    «2/3» junto a la columna limitada es la forma en que un
                    tablero kanban hace visible el cuello de botella antes de
                    chocar con él.
                  */}
                  {col.wipLimit !== null ? (
                    <span
                      className={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-xs font-medium tabular-nums ${
                        dentro.length >= col.wipLimit ? 'bg-danger-soft text-danger' : 'text-ink-muted'
                      }`}
                      title={`${dentro.length} de un máximo de ${col.wipLimit} en ${col.name}`}
                    >
                      {dentro.length}/{col.wipLimit}
                    </span>
                  ) : (
                    <span className="ml-auto shrink-0 text-xs tabular-nums text-ink-muted">
                      {dentro.length}
                    </span>
                  )}
                </header>

                {/* El orden es configuración del tablero, no preferencia de
                    cada navegador: se guarda en la columna y lo ve el equipo
                    entero. Cada etapa se lee con una pregunta distinta —qué
                    tomar ahora, qué lleva más tiempo atascado—, y por eso el
                    criterio es de la columna y no del tablero. */}
                <label className="mb-2 flex items-center gap-1.5 px-0.5 text-[11px] text-ink-muted">
                  <span className="sr-only">Ordenar {col.name} por</span>
                  <select
                    value={col.sort}
                    disabled={cambiarColumna.isPending}
                    onChange={(e) =>
                      cambiarColumna.mutate({
                        id: col.id,
                        patch: { sort: e.target.value as ColumnSort },
                      })
                    }
                    aria-label={`Ordenar ${col.name} por`}
                    className="w-full rounded border border-border bg-surface px-1.5 py-1 text-[11px] outline-none focus:border-brand"
                  >
                    {COLUMN_SORTS.map((criterio) => (
                      <option key={criterio} value={criterio}>
                        {COLUMN_SORT_LABEL[criterio]}
                      </option>
                    ))}
                  </select>
                </label>

                {/* Altura mínima para que una columna vacía no colapse y
                    descuadre el tablero. */}
                <div className="flex min-h-[7rem] flex-1 flex-col gap-2">
                  {dentro.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      pending={moviendoId === task.id}
                      autoFocus={recienMovida === task.id}
                      anterior={anterior}
                      siguiente={siguiente}
                      onMove={(columnId) => moverTarea(task, columnId, 'flecha')}
                      onEdit={() => setEditando(task)}
                      onDelete={() => borrarTarea(task)}
                    />
                  ))}

                  {dentro.length === 0 && (
                    <p className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-ink-muted">
                      {hayFiltro ? 'Sin tareas que coincidan' : 'Sin tareas'}
                    </p>
                  )}
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 w-full justify-start"
                  aria-label={`Añadir tarea a ${col.name}`}
                  onClick={() => setCreandoEn(col)}
                >
                  <Plus className="size-3.5" aria-hidden />
                  Añadir
                </Button>
              </ColumnaDestino>
            );
          })}
          </div>

          {/*
            El clon vive en un portal fuera del carrusel: dentro, el
            `overflow-x: auto` lo recortaría al salir de la columna. La
            animación de vuelta es lo que hace que soltar en un sitio no
            válido se lea como «no pasó nada» y no como «se perdió».
          */}
          <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>
            {arrastrada && (
              <div className="rotate-2 rounded-lg border border-brand bg-surface p-3 shadow-xl">
                <p className="text-sm">{arrastrada.title}</p>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {/* Montado solo cuando se abre, no siempre.
          Renderizarlo con `open={creandoEn !== null}` dejaba los dos diálogos
          —crear y editar— en el documento a la vez, con los mismos `id` en sus
          campos: `<label htmlFor="task-column">` apuntaba entonces al del
          primero y el segundo se quedaba sin etiqueta asociada. Es el mismo
          defecto que ya se corrigió en `ProjectCard`, colado de nuevo aquí; lo
          cazó un E2E al encontrar dos `#task-column`. */}
      {creandoEn && (
        <TaskFormDialog
          open
          onClose={() => setCreandoEn(null)}
          projectId={projectId}
          columnas={columnas}
          defaultColumnId={creandoEn.id}
        />
      )}
      {editando && (
        <TaskFormDialog
          open
          onClose={() => setEditando(null)}
          projectId={projectId}
          columnas={columnas}
          task={editando}
        />
      )}
      {gestionando && (
        <ColumnManagerDialog
          open
          onClose={() => setGestionando(false)}
          projectId={projectId}
          columnas={columnas}
        />
      )}
    </section>
  );
}

/**
 * La columna es la zona donde se sueltan las tarjetas. Es un componente aparte
 * porque `useDroppable` es un hook y las columnas se pintan dentro de un
 * `.map`.
 *
 * El `id` de la zona ES el estado: así `onDragEnd` recibe directamente el
 * destino sin tener que traducir nada.
 */
function ColumnaDestino({
  columna,
  arrastrando,
  children,
}: {
  columna: ProjectColumnSummary;
  arrastrando: boolean;
  children: ReactNode;
}) {
  // El `id` de la zona ES el de la columna: así `onDragEnd` recibe el destino
  // sin traducir nada. Antes era el estado, cuando ambos coincidían.
  const { setNodeRef, isOver } = useDroppable({ id: columna.id });

  return (
    <section
      ref={setNodeRef}
      aria-label={columna.name}
      /**
       * La columna es la unidad de destino, y tiene que verse así.
       *
       * Arrastrar cambia el **estado** de la tarea, no su posición: el orden lo
       * fija PostgreSQL (`priority DESC, created_at DESC`). Una interfaz que
       * abriera huecos entre tarjetas o desplazara a las vecinas prometería un
       * control de orden que el modelo no tiene, y la tarjeta acabaría en un
       * sitio distinto del señalado. Por eso al sobrevolar se realza la columna
       * **entera** con un anillo, y nunca se dibuja un punto de inserción.
       */
      className={`relative flex w-[82vw] shrink-0 snap-center flex-col rounded-xl border p-3 transition-colors lg:w-auto
        ${isOver ? 'border-brand bg-brand/5 ring-2 ring-brand/40' : 'border-border bg-canvas/60'}
        ${arrastrando && !isOver ? 'border-dashed' : ''}`}
    >
      {/* Dice a dónde va la tarjeta, que es lo único que el gesto decide. */}
      {isOver && (
        <p className="pointer-events-none absolute inset-x-3 top-3 z-10 rounded-lg bg-brand px-2.5 py-1 text-center text-xs font-medium text-white shadow">
          Soltar para mover a {columna.name}
        </p>
      )}
      {children}
    </section>
  );
}

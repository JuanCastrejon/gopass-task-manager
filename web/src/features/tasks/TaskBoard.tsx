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
import { Plus } from 'lucide-react';
import { Button } from '../../components/ui/Button.tsx';
import { ErrorState, Skeleton } from '../../components/ui/States.tsx';
import { STATUS_LABEL, StatusDot } from '../../components/ui/Badge.tsx';
import { CampoBusqueda, GrupoDePrioridad } from '../../components/ui/Filtros.tsx';
import { messageFor } from '../../lib/error-messages.ts';
import { useFiltrosDeUrl } from '../../lib/use-filtros-de-url.ts';
import { TASK_STATUSES, type Task, type TaskStatus } from '../../types/api.ts';
import { TaskCard } from './TaskCard.tsx';
import { TaskFormDialog } from './TaskFormDialog.tsx';
import { useDeleteTask, useTasks, useUpdateTask } from './api.ts';

export function TaskBoard({ projectId }: { projectId: string }) {
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

  const [creandoEn, setCreandoEn] = useState<TaskStatus | null>(null);
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
  const [proyeccion, setProyeccion] = useState<{ id: string; destino: TaskStatus } | null>(null);

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
  function moverTarea(task: Task, status: TaskStatus, origen: 'flecha' | 'arrastre' = 'flecha'): void {
    if (moviendoId !== null) return; // reentrada por doble clic rápido
    setMoviendoId(task.id);
    if (origen === 'arrastre') setProyeccion({ id: task.id, destino: status });
    mover.mutate(
      { id: task.id, patch: { status } },
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
    const destino = evento.over?.id as TaskStatus | undefined;
    if (!destino) return;

    const task = tareas.data?.find((t) => t.id === evento.active.id);
    if (!task || task.status === destino) return;

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
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {TASK_STATUSES.map((s) => (
            <div key={s} className="space-y-2 rounded-xl border border-border bg-canvas/60 p-3">
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
            className={`flex gap-4 overflow-x-auto pb-3
                       lg:grid lg:grid-cols-3 lg:overflow-visible lg:pb-0
                       ${arrastrada ? 'snap-none' : 'snap-x snap-mandatory'}`}
          >
          {TASK_STATUSES.map((estado) => {
            // El estado que se pinta es el proyectado, no el confirmado: es lo
            // que hace que la tarjeta se quede donde la sueltas.
            const columna = tareas.data.filter(
              (t) => (proyeccion?.id === t.id ? proyeccion.destino : t.status) === estado,
            );
            return (
              // Cada columna es una región con nombre propio. Sin esto, un
              // lector de pantalla anuncia tres secciones indistinguibles y
              // los tres botones «Añadir» suenan igual.
              <ColumnaDestino key={estado} estado={estado} arrastrando={arrastrada !== null}>
                <header className="mb-2.5 flex items-center gap-2 px-0.5">
                  <StatusDot status={estado} />
                  <h3 className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                    {STATUS_LABEL[estado]}
                  </h3>
                  <span className="ml-auto text-xs tabular-nums text-ink-muted">
                    {columna.length}
                  </span>
                </header>

                {/* Altura mínima para que una columna vacía no colapse y
                    descuadre el tablero. */}
                <div className="flex min-h-[7rem] flex-1 flex-col gap-2">
                  {columna.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      pending={moviendoId === task.id}
                      autoFocus={recienMovida === task.id}
                      onMove={(status) => moverTarea(task, status, 'flecha')}
                      onEdit={() => setEditando(task)}
                      onDelete={() => borrarTarea(task)}
                    />
                  ))}

                  {columna.length === 0 && (
                    <p className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-ink-muted">
                      {hayFiltro ? 'Sin tareas que coincidan' : 'Sin tareas'}
                    </p>
                  )}
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 w-full justify-start"
                  aria-label={`Añadir tarea a ${STATUS_LABEL[estado]}`}
                  onClick={() => setCreandoEn(estado)}
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

      <TaskFormDialog
        open={creandoEn !== null}
        onClose={() => setCreandoEn(null)}
        projectId={projectId}
        {...(creandoEn ? { defaultStatus: creandoEn } : {})}
      />
      {editando && (
        <TaskFormDialog
          open
          onClose={() => setEditando(null)}
          projectId={projectId}
          task={editando}
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
  estado,
  arrastrando,
  children,
}: {
  estado: TaskStatus;
  arrastrando: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: estado });

  return (
    <section
      ref={setNodeRef}
      aria-label={STATUS_LABEL[estado]}
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
          Soltar para mover a {STATUS_LABEL[estado]}
        </p>
      )}
      {children}
    </section>
  );
}

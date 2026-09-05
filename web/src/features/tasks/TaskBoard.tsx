import { useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Button } from '../../components/ui/Button.tsx';
import { ErrorState, Skeleton } from '../../components/ui/States.tsx';
import { PRIORITY_LABEL, STATUS_LABEL, StatusDot } from '../../components/ui/Badge.tsx';
import { messageFor } from '../../lib/error-messages.ts';
import { useSearchParams } from '../../lib/router.tsx';
import { TASK_PRIORITIES, TASK_STATUSES, type Task, type TaskPriority, type TaskStatus } from '../../types/api.ts';
import { TaskCard } from './TaskCard.tsx';
import { TaskFormDialog } from './TaskFormDialog.tsx';
import { useDeleteTask, useTasks, useUpdateTask } from './api.ts';

export function TaskBoard({ projectId }: { projectId: string }) {
  /**
   * Los filtros viven en la URL, no en `useState`: así el tablero filtrado
   * sobrevive a una recarga y se puede compartir por enlace. Se escriben con
   * `replaceState`, de modo que teclear en el buscador no llena el historial.
   *
   * **No hay filtro por estado**, y es deliberado: las tres columnas ya SON la
   * dimensión de estado. Filtrar por `DONE` dejaría dos columnas vacías y el
   * tablero parecería roto en vez de filtrado.
   */
  const [params, setParams] = useSearchParams();
  const prioridad = params.get('priority') as TaskPriority | null;
  const busquedaUrl = params.get('q') ?? '';

  const [busqueda, setBusqueda] = useState(busquedaUrl);

  // La URL puede cambiar por fuera de este input: el botón «atrás» del
  // navegador, o un enlace compartido. Sin esto, el campo seguiría mostrando
  // el texto anterior mientras la lista ya se ha refrescado sin filtrar.
  useEffect(() => {
    setBusqueda(busquedaUrl);
  }, [busquedaUrl]);

  // Se escribe en la URL con retardo: sin esto cada tecla dispararía una
  // petición y una entrada de historial.
  useEffect(() => {
    if (busqueda.trim() === busquedaUrl) return;
    const t = setTimeout(() => {
      // Los parámetros se leen de `window.location` DENTRO del temporizador,
      // no del render que lo programó. Con la versión capturada en el cierre,
      // activar un chip de prioridad mientras se escribe hacía que el
      // temporizador pendiente reescribiera la URL sin esa prioridad y el
      // filtro se desmarcara solo 250 ms después. Reproducido y corregido.
      const next = new URLSearchParams(window.location.search);
      if (busqueda.trim()) next.set('q', busqueda.trim());
      else next.delete('q');
      setParams(next);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, busquedaUrl]);

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

  function cambiarPrioridad(valor: TaskPriority | null): void {
    const next = new URLSearchParams(window.location.search);
    if (valor) next.set('priority', valor);
    else next.delete('priority');
    setParams(next);
  }

  function moverTarea(task: Task, status: TaskStatus): void {
    if (moviendoId !== null) return; // reentrada por doble clic rápido
    setMoviendoId(task.id);
    mover.mutate(
      { id: task.id, patch: { status } },
      {
        onSuccess: () => setRecienMovida(task.id),
        onSettled: () => setMoviendoId(null),
      },
    );
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

  const hayFiltro = busquedaUrl !== '' || prioridad !== null;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Tareas</h2>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-muted" aria-hidden />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar"
              aria-label="Buscar tareas por título"
              className="h-8 w-40 rounded-lg border border-border bg-surface pl-8 pr-2.5 text-xs outline-none focus:border-brand"
            />
          </div>

          <div className="flex gap-1" role="group" aria-label="Filtrar por prioridad">
            <FiltroChip activo={prioridad === null} onClick={() => cambiarPrioridad(null)}>
              Todas
            </FiltroChip>
            {TASK_PRIORITIES.map((p) => (
              <FiltroChip key={p} activo={prioridad === p} onClick={() => cambiarPrioridad(p)}>
                {PRIORITY_LABEL[p]}
              </FiltroChip>
            ))}
          </div>
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
        <div
          role="region"
          aria-label="Tablero de tareas"
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3
                     lg:grid lg:grid-cols-3 lg:overflow-visible lg:pb-0"
        >
          {TASK_STATUSES.map((estado) => {
            const columna = tareas.data.filter((t) => t.status === estado);
            return (
              // Cada columna es una región con nombre propio. Sin esto, un
              // lector de pantalla anuncia tres secciones indistinguibles y
              // los tres botones «Añadir» suenan igual.
              <section
                key={estado}
                aria-label={STATUS_LABEL[estado]}
                className="flex w-[82vw] shrink-0 snap-center flex-col rounded-xl border border-border
                           bg-canvas/60 p-3 lg:w-auto"
              >
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
                      onMove={(status) => moverTarea(task, status)}
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
              </section>
            );
          })}
        </div>
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

function FiltroChip({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`h-8 rounded-lg px-2.5 text-xs font-medium transition ${
        activo
          ? 'bg-brand text-white'
          : 'border border-border bg-surface text-ink-muted hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

import { useRef, useState, type ReactNode } from 'react';
import {
  closestCenter,
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
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { Columns3, Plus, Tag } from 'lucide-react';
import { Button } from '../../components/ui/Button.tsx';
import { ErrorState, Skeleton } from '../../components/ui/States.tsx';
import { LABEL_STYLE, StatusDot } from '../../components/ui/Badge.tsx';
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
import { useLabels } from '../labels/api.ts';
import { LabelManagerDialog } from '../labels/LabelManagerDialog.tsx';
import { TaskCard } from './TaskCard.tsx';
import { TaskFormDialog } from './TaskFormDialog.tsx';
import { useDeleteTask, useReorderTask, useTasks, useUpdateTask } from './api.ts';

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
  const {
    busqueda,
    setBusqueda,
    busquedaUrl,
    prioridad,
    cambiarPrioridad,
    etiquetas,
    alternarEtiqueta,
    hayFiltro,
  } = useFiltrosDeUrl();

  const { data: projectLabels = [] } = useLabels(projectId);
  const [gestionandoEtiquetas, setGestionandoEtiquetas] = useState(false);

  // Aquí se filtra en el servidor y por eso se consulta con `busquedaUrl`, ya
  // retardada: una colección de tareas puede crecer sin techo y `q` viaja al
  // `ILIKE`. En el panel de proyectos la decisión es la contraria.
  const tareas = useTasks(projectId, {
    ...(busquedaUrl ? { q: busquedaUrl } : {}),
    ...(prioridad ? { priority: [prioridad] } : {}),
    ...(etiquetas.length > 0 ? { labels: etiquetas } : {}),
  });

  const mover = useUpdateTask();
  const reordenar = useReorderTask();
  const borrar = useDeleteTask();

  const [creandoEn, setCreandoEn] = useState<ProjectColumnSummary | null>(null);
  const [gestionando, setGestionando] = useState(false);
  const cambiarColumna = useUpdateColumn(projectId);
  const [editando, setEditando] = useState<Task | null>(null);
  const [moviendoId, setMoviendoId] = useState<string | null>(null);
  const [recienMovida, setRecienMovida] = useState<string | null>(null);

  /** Columnas de categoría DONE para el control de completar de un clic (SL-16). */
  const columnasDone = columnas.filter((c) => c.category === 'DONE');

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
   * Al soltar una tarjeta arrastrada:
   *
   * Se evalúa si el destino es la misma columna (reordenación vertical) o una columna distinta.
   *
   * 1. Misma columna:
   *    - Si la columna no tiene `sort === 'manual'`, el reordenado vertical queda estrictamente
   *      bloqueado para no cambiar la configuración a escondidas (SL-15).
   *    - Si es manual, se calculan las vecinas inmediata anterior y posterior (`previousTaskId` y `nextTaskId`)
   *      tras resolver la nueva posición con `arrayMove`, y se envía al endpoint fraccionario.
   *
   * 2. Distinta columna:
   *    - Mover entre columnas funciona siempre, sin importar el orden de ambas columnas.
   *    - Si el destino es manual, se calcula la posición de inserción deseada y se usa el reordenado.
   *    - Si el destino es automático, se delega en el parche de tarea para que el motor aplique su orden.
   */
  function alSoltar(evento: DragEndEvent): void {
    setArrastrada(null);
    const { active, over } = evento;
    if (!over || !tareas.data) return;

    const activeTaskId = String(active.id);
    const overId = String(over.id);

    const task = tareas.data.find((t) => t.id === activeTaskId);
    if (!task) return;

    // Determinar la columna de destino:
    // El objetivo `over.id` puede ser directamente la columna (droppable)
    // o bien una tarjeta que reside en esa columna (sortable).
    const columnaDestinoDirecta = columnas.find((c) => c.id === overId);
    const tareaDestino = tareas.data?.find((t) => t.id === overId);
    const destinoColumnaId = columnaDestinoDirecta?.id ?? tareaDestino?.columnId;

    if (!destinoColumnaId) return;

    const origenColumnaId = task.columnId;
    const colOrigen = columnas.find((c) => c.id === origenColumnaId);
    const colDestino = columnas.find((c) => c.id === destinoColumnaId);

    if (!colOrigen || !colDestino) return;

    // CASO 1: Reordenado dentro de la misma columna
    if (origenColumnaId === destinoColumnaId) {
      // Bloqueo estricto: en columnas con orden automático (por prioridad o fecha),
      // el reordenado vertical no altera nada y no dispara ninguna petición de red.
      if (colOrigen.sort !== 'manual') {
        return;
      }

      // Soltada sobre sí misma: posición inalterada.
      if (activeTaskId === overId) {
        return;
      }

      const tareasDeColumna = tareas.data.filter((t) => t.columnId === origenColumnaId);
      const indiceViejo = tareasDeColumna.findIndex((t) => t.id === activeTaskId);
      const indiceNuevo = tareasDeColumna.findIndex((t) => t.id === overId);

      if (indiceViejo === -1) return;

      let listaReordenada: Task[];
      if (indiceNuevo !== -1) {
        listaReordenada = arrayMove(tareasDeColumna, indiceViejo, indiceNuevo);
      } else {
        // Soltada sobre la columna directamente: se coloca al final.
        const sinActiva = tareasDeColumna.filter((t) => t.id !== activeTaskId);
        listaReordenada = [...sinActiva, task];
      }

      const posicionFinal = listaReordenada.findIndex((t) => t.id === activeTaskId);
      if (posicionFinal === indiceViejo) return;

      const anterior = listaReordenada[posicionFinal - 1] ?? null;
      const siguiente = listaReordenada[posicionFinal + 1] ?? null;

      reordenar.mutate({
        id: activeTaskId,
        input: {
          columnId: origenColumnaId,
          previousTaskId: anterior ? anterior.id : null,
          nextTaskId: siguiente ? siguiente.id : null,
        },
        tareasOptimistas: listaReordenada,
      });
      return;
    }

    // CASO 2: Movimiento hacia otra columna
    // Mover entre columnas sigue funcionando siempre en cualquier tipo de columna.
    if (colDestino.sort === 'manual') {
      const tareasDestino = tareas.data.filter((t) => t.columnId === destinoColumnaId);
      const indiceOver = tareasDestino.findIndex((t) => t.id === overId);

      let anterior: Task | null = null;
      let siguiente: Task | null = null;
      let listaDestino: Task[];
      const tareaMovida: Task = { ...task, columnId: destinoColumnaId };

      if (indiceOver !== -1) {
        listaDestino = [
          ...tareasDestino.slice(0, indiceOver),
          tareaMovida,
          ...tareasDestino.slice(indiceOver),
        ];
        const pos = indiceOver;
        anterior = listaDestino[pos - 1] ?? null;
        siguiente = listaDestino[pos + 1] ?? null;
      } else {
        anterior = tareasDestino[tareasDestino.length - 1] ?? null;
        siguiente = null;
        listaDestino = [...tareasDestino, tareaMovida];
      }

      const tareasOrigenRestantes = tareas.data.filter(
        (t) => t.columnId === origenColumnaId && t.id !== activeTaskId,
      );

      reordenar.mutate({
        id: activeTaskId,
        input: {
          columnId: destinoColumnaId,
          previousTaskId: anterior ? anterior.id : null,
          nextTaskId: siguiente ? siguiente.id : null,
        },
        tareasOptimistas: [...tareasOrigenRestantes, ...listaDestino],
      });
    } else {
      // Si la columna destino tiene orden automático, usamos la mutación normal de mover.
      moverTarea(task, destinoColumnaId, 'arrastre');
    }
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
            Arrastra para mover entre columnas o reordena dentro de columnas con orden manual
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
          {projectLabels.length > 0 && (
            <div
              className="flex flex-wrap items-center gap-1"
              role="group"
              aria-label="Filtrar tareas por etiqueta"
            >
              {projectLabels.map((lbl) => {
                const activo = etiquetas.includes(lbl.id);
                return (
                  <button
                    key={lbl.id}
                    type="button"
                    onClick={() => alternarEtiqueta(lbl.id)}
                    aria-pressed={activo}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                      activo
                        ? `${LABEL_STYLE[lbl.color]} ring-2 ring-brand ring-offset-1 font-semibold`
                        : 'border border-border bg-surface text-ink-muted hover:text-ink'
                    }`}
                  >
                    <span
                      className={`size-2 rounded-full ${
                        activo ? 'bg-current' : 'border border-ink-muted/40'
                      }`}
                      aria-hidden
                    />
                    <span>{lbl.name}</span>
                  </button>
                );
              })}
            </div>
          )}
          <Button variant="secondary" size="sm" onClick={() => setGestionandoEtiquetas(true)}>
            <Tag className="size-3.5" aria-hidden />
            Etiquetas
          </Button>
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
      {(borrar.isError || mover.isError || reordenar.isError) && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {messageFor(borrar.error ?? mover.error ?? reordenar.error, 'No se pudo actualizar la tarea.')}
        </p>
      )}

      {tareas.isPending && (
        <div className="grid grid-cols-1 gap-4 lg:flex lg:gap-3 lg:overflow-x-auto lg:pb-3">
          {columnas.map((c) => (
            <div key={c.id} className="space-y-2 rounded-xl border border-border bg-canvas/60 p-3 lg:w-[272px] lg:shrink-0">
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
          collisionDetection={closestCenter}
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
             * Geometría fija estilo Trello (272 px, shrink-0, gap de 12 px) desde `lg`:
             *
             * Qué se gana y qué se pierde:
             * Se gana ritmo y geometría estable: las tarjetas mantienen siempre sus
             * proporciones tipográficas y espaciales ideales, sin estirarse deformadas
             * cuando hay pocas listas en pantallas panorámicas ni comprimirse en exceso.
             * Se pierde aprovechamiento de pantallas muy anchas: el tablero no se
             * expande para llenar todo el ancho con 1fr, requiriendo desplazamiento
             * horizontal cuando el conjunto de listas supera el viewport disponible.
             *
             * Por debajo de `lg` no se cambia nada: el apilado y carrusel de 82vw ya
             * funciona y está probado para pantallas reducidas y táctiles.
             */
            /**
             * A partir de `lg` el tablero rompe el contenedor de 64rem de la
             * aplicacion y usa el ancho real de la ventana.
             *
             * Con columnas flexibles daba igual: se estiraban hasta llenar los
             * 984 px utiles. Con 272 px fijos, en una pantalla de 1440 se veian
             * tres columnas y media y aparecia desplazamiento con solo cuatro,
             * desperdiciando 456 px. Un tablero es justo la vista que necesita
             * el ancho, y por eso Trello lo pinta a sangre.
             *
             * El relleno que compensa el margen negativo va SOLO al inicio.
             * Ponerlo tambien al final inflaba el ancho desplazable en el doble
             * del margen y aparecia barra de desplazamiento aunque las cuatro
             * columnas cupieran de sobra: 1540 px de contenido para 1400 de
             * hueco. Al final basta un respiro pequeno.
             */
            className={`flex gap-4 overflow-x-auto pb-3
                       lg:flex lg:gap-3 lg:overflow-x-auto lg:pb-3
                       lg:-mx-[max(0px,calc((100vw-64rem)/2))]
                       lg:ps-[max(0px,calc((100vw-64rem)/2))] lg:pe-5
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
              <ColumnaDestino
                key={col.id}
                columna={col}
                arrastrando={arrastrada !== null}
                esDestinoDistinto={arrastrada !== null && arrastrada.columnId !== col.id}
              >
                <header className="mb-2 flex items-center gap-1.5 px-0.5">
                  {/* El punto sigue el color de la CATEGORÍA, no del nombre:
                      «QA» y «En revisión» son ambas trabajo en curso y deben
                      leerse como tal de un vistazo. */}
                  <StatusDot status={col.category} />
                  <h3 className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-ink-muted" title={col.name}>
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
                    className="h-6 w-full rounded border border-border bg-surface px-1.5 py-0 text-[11px] text-ink-muted outline-none focus:text-ink focus:border-brand"
                  >
                    {COLUMN_SORTS.map((criterio) => (
                      <option key={criterio} value={criterio}>
                        {COLUMN_SORT_LABEL[criterio]}
                      </option>
                    ))}
                  </select>
                </label>

                {/* Si la columna no tiene orden manual, se avisa de forma visible
                    por qué el reordenado vertical no está disponible (SL-15). */}
                {col.sort !== 'manual' && (
                  <p className="mb-2 px-0.5 text-[10px] leading-tight text-ink-muted">
                    {col.sort.startsWith('priority')
                      ? 'Ordenada por prioridad — cambia el orden a manual para reordenar'
                      : 'Ordenada por fecha — cambia el orden a manual para reordenar'}
                  </p>
                )}

                {/* Altura mínima para que una columna vacía no colapse y
                    descuadre el tablero. */}
                <SortableContext
                  id={col.id}
                  items={dentro.map((t) => t.id)}
                  strategy={verticalListSortingStrategy}
                  disabled={col.sort !== 'manual'}
                >
                  <div className="flex min-h-[7rem] flex-1 flex-col gap-2">
                    {dentro.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        pending={moviendoId === task.id}
                        autoFocus={recienMovida === task.id}
                        anterior={anterior}
                        siguiente={siguiente}
                        columnasDone={columnasDone}
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
                </SortableContext>

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
      {gestionandoEtiquetas && (
        <LabelManagerDialog
          open
          onClose={() => setGestionandoEtiquetas(false)}
          projectId={projectId}
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
  esDestinoDistinto,
  children,
}: {
  columna: ProjectColumnSummary;
  arrastrando: boolean;
  esDestinoDistinto: boolean;
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
       * La columna es la unidad de destino para movimientos inter-columna.
       * En desktop (`lg`), adopta un ancho fijo de 272 px con shrink-0 (estilo Trello)
       * y resalta con anillo al arrastrar sobre ella.
       */
      className={`relative flex w-[82vw] shrink-0 snap-center flex-col rounded-xl border p-3 transition-colors lg:w-[272px] lg:shrink-0
        ${isOver ? 'border-brand bg-brand/5 ring-2 ring-brand/40' : 'border-border bg-canvas/60'}
        ${arrastrando && !isOver ? 'border-dashed' : ''}`}
    >
      {/* Informa a qué columna se moverá la tarjeta solo si se arrastra desde otra columna distinta */}
      {isOver && esDestinoDistinto && (
        <p className="pointer-events-none absolute inset-x-3 top-3 z-10 rounded-lg bg-brand px-2.5 py-1 text-center text-xs font-medium text-white shadow">
          Soltar para mover a {columna.name}
        </p>
      )}
      {children}
    </section>
  );
}

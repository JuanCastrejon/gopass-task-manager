import { useMemo, useState } from 'react';
import { FolderPlus, Plus, SearchX } from 'lucide-react';
import { Button } from '../../components/ui/Button.tsx';
import { CampoBusqueda, GrupoDePrioridad } from '../../components/ui/Filtros.tsx';
import { EmptyState, ErrorState, ProjectCardSkeleton } from '../../components/ui/States.tsx';
import { messageFor } from '../../lib/error-messages.ts';
import { useFiltrosDeUrl } from '../../lib/use-filtros-de-url.ts';
import { StatsPanel } from '../dashboard/StatsPanel.tsx';
import { ProjectCard } from './ProjectCard.tsx';
import { ProjectFormDialog } from './ProjectFormDialog.tsx';
import { useProjects } from './api.ts';

export function ProjectsPage() {
  const [creando, setCreando] = useState(false);
  const proyectos = useProjects();

  const { busqueda, setBusqueda, prioridad, cambiarPrioridad, limpiar, hayFiltro } =
    useFiltrosDeUrl();

  /**
   * El filtrado ocurre en el cliente, al revés que en el tablero de tareas.
   *
   * No es una incoherencia, es la diferencia entre las dos colecciones. Las
   * tareas de un proyecto pueden crecer sin techo y su filtro viaja al `ILIKE`
   * de PostgreSQL; los proyectos son un catálogo acotado, sin paginación, y la
   * lista entera ya está en la caché de React Query desde el primer render.
   * Pedirla otra vez por cada tecla añadiría un viaje, una clave de caché por
   * combinación y un parpadeo de esqueleto, y no quitaría trabajo a nadie.
   *
   * Se filtra por `busqueda` —lo tecleado— y no por lo que hay en la URL: al no
   * haber petición, esperar los 250 ms del retardo solo serviría para que la
   * lista respondiera tarde. La URL sigue actualizándose por detrás, así que el
   * enlace se puede compartir y la recarga conserva el filtro.
   *
   * El chip de prioridad es una condición existencial sobre los hijos —«tiene
   * al menos una tarea de esa prioridad»—, porque un proyecto no tiene
   * prioridad propia.
   */
  const filtrados = useMemo(() => {
    const texto = busqueda.trim().toLocaleLowerCase();
    return (proyectos.data ?? []).filter((p) => {
      const coincideNombre = texto === '' || p.name.toLocaleLowerCase().includes(texto);
      const coincidePrioridad = prioridad === null || p.byPriority[prioridad] > 0;
      return coincideNombre && coincidePrioridad;
    });
  }, [proyectos.data, busqueda, prioridad]);

  // Comparado contra `data` y no contra un booleano derivado: así TypeScript
  // estrecha el tipo dentro del bloque y no hace falta un `!` más abajo.
  const todos = proyectos.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">Proyectos</h1>
          <p className="text-sm text-ink-muted">Estado del trabajo en curso</p>
        </div>
        <Button variant="primary" onClick={() => setCreando(true)}>
          <Plus className="size-4" aria-hidden />
          Nuevo proyecto
        </Button>
      </div>

      <StatsPanel />

      {/* `isPending` y no `isFetching`: al invalidar tras una mutación los
          datos anteriores siguen en caché, y desmontarlos haría parpadear la
          lista entera a "cargando" después de cada creación. */}
      {proyectos.isPending && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ProjectCardSkeleton />
          <ProjectCardSkeleton />
          <ProjectCardSkeleton />
        </div>
      )}

      {proyectos.isError && (
        <ErrorState message={messageFor(proyectos.error)} onRetry={() => void proyectos.refetch()} />
      )}

      {proyectos.data?.length === 0 && (
        <EmptyState
          icon={<FolderPlus className="size-7" aria-hidden />}
          title="Todavía no hay proyectos"
          description="Crea el primero para empezar a organizar las tareas del equipo."
          action={
            <Button variant="primary" onClick={() => setCreando(true)}>
              <Plus className="size-4" aria-hidden />
              Crear el primer proyecto
            </Button>
          }
        />
      )}

      {todos && todos.length > 0 && (
        <>
          {/* La barra solo aparece cuando hay algo que filtrar: con la lista
              vacía sería un control que no puede hacer nada. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">
              {hayFiltro ? `${filtrados.length} de ${todos.length}` : 'Todos los proyectos'}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <CampoBusqueda
                value={busqueda}
                onChange={setBusqueda}
                ariaLabel="Buscar proyectos por nombre"
              />
              <GrupoDePrioridad
                valor={prioridad}
                onChange={cambiarPrioridad}
                ariaLabel="Filtrar proyectos por prioridad de sus tareas"
              />
            </div>
          </div>

          {/* Solo para lectores de pantalla. Anuncia el resultado del filtrado
              y la recarga de fondo sin tapar ni mover nada de lo que ya está en
              pantalla; el conteo visible de arriba cumple el mismo papel para
              quien ve la pantalla. */}
          <span aria-live="polite" className="sr-only">
            {proyectos.isFetching
              ? 'Actualizando proyectos'
              : hayFiltro
                ? `${filtrados.length} ${filtrados.length === 1 ? 'proyecto' : 'proyectos'} coinciden con los filtros`
                : ''}
          </span>

          {filtrados.length === 0 ? (
            // El texto del vacío original —«crea el primero»— mentiría aquí:
            // proyectos hay, lo que no hay es coincidencias. Mismo componente,
            // otro mensaje y otra salida.
            <EmptyState
              icon={<SearchX className="size-7" aria-hidden />}
              title="Ningún proyecto coincide"
              description="Prueba con otro nombre, o quita el filtro de prioridad."
              action={
                <Button variant="secondary" onClick={limpiar}>
                  Limpiar filtros
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtrados.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          )}
        </>
      )}

      {creando && <ProjectFormDialog open onClose={() => setCreando(false)} />}
    </div>
  );
}

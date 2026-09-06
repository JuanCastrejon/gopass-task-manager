import { useMemo, useState } from 'react';
import { FolderPlus, Plus, SearchX } from 'lucide-react';
import { Button } from '../../components/ui/Button.tsx';
import { CampoBusqueda } from '../../components/ui/Filtros.tsx';
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

  const { busqueda, setBusqueda, limpiar } = useFiltrosDeUrl();

  /**
   * Fuera del proyecto solo se busca por nombre.
   *
   * Hubo aquí chips de prioridad —«proyectos con al menos una tarea de esa
   * prioridad»— y se retiraron: un proyecto no tiene prioridad, así que el
   * control prometía una dimensión que la entidad no posee. Es también lo que
   * hacen Trello, Jira y Linear: el buscador vive fuera y los filtros ricos
   * dentro del tablero, donde la dimensión sí existe. `useFiltrosDeUrl` sigue
   * ofreciendo `prioridad` para el tablero, que sí la usa.
   *
   * El filtrado ocurre en el cliente, al revés que en el tablero de tareas. No
   * es una incoherencia, es la diferencia entre las dos colecciones. Las tareas
   * de un proyecto pueden crecer sin techo y su filtro viaja al `ILIKE` de
   * PostgreSQL; los proyectos son un catálogo acotado, sin paginación, y la
   * lista entera ya está en la caché de React Query desde el primer render.
   *
   * Se filtra por `busqueda` —lo tecleado— y no por lo que hay en la URL: al no
   * haber petición, esperar los 250 ms del retardo solo serviría para que la
   * lista respondiera tarde. La URL sigue actualizándose por detrás, así que el
   * enlace se puede compartir y la recarga conserva la búsqueda.
   */
  const filtrados = useMemo(() => {
    const texto = busqueda.trim().toLocaleLowerCase();
    if (texto === '') return proyectos.data ?? [];
    return (proyectos.data ?? []).filter((p) => p.name.toLocaleLowerCase().includes(texto));
  }, [proyectos.data, busqueda]);

  // Propio y no el `hayFiltro` del hook: aquí no hay chip, y un `?priority=`
  // sobrante en una URL antigua haría creer que la lista está filtrada por algo
  // que esta pantalla ya no mira.
  const hayBusqueda = busqueda.trim() !== '';

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
          {/* El buscador solo aparece cuando hay algo que buscar: con la lista
              vacía sería un control que no puede hacer nada. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">
              {hayBusqueda ? `${filtrados.length} de ${todos.length}` : 'Todos los proyectos'}
            </h2>
            <CampoBusqueda
              value={busqueda}
              onChange={setBusqueda}
              ariaLabel="Buscar proyectos por nombre"
            />
          </div>

          {/* Solo para lectores de pantalla. Anuncia el resultado del filtrado
              y la recarga de fondo sin tapar ni mover nada de lo que ya está en
              pantalla; el conteo visible de arriba cumple el mismo papel para
              quien ve la pantalla. */}
          <span aria-live="polite" className="sr-only">
            {proyectos.isFetching
              ? 'Actualizando proyectos'
              : hayBusqueda
                ? `${filtrados.length} ${filtrados.length === 1 ? 'proyecto coincide' : 'proyectos coinciden'} con la búsqueda`
                : ''}
          </span>

          {filtrados.length === 0 ? (
            // El texto del vacío original —«crea el primero»— mentiría aquí:
            // proyectos hay, lo que no hay es coincidencias. Mismo componente,
            // otro mensaje y otra salida.
            <EmptyState
              icon={<SearchX className="size-7" aria-hidden />}
              title="Ningún proyecto coincide"
              description="Prueba con otro nombre, o borra la búsqueda para verlos todos."
              action={
                <Button variant="secondary" onClick={limpiar}>
                  Limpiar búsqueda
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

import { useState } from 'react';
import { FolderPlus, Plus } from 'lucide-react';
import { Button } from '../../components/ui/Button.tsx';
import { EmptyState, ErrorState, ProjectCardSkeleton } from '../../components/ui/States.tsx';
import { messageFor } from '../../lib/error-messages.ts';
import { StatsPanel } from '../dashboard/StatsPanel.tsx';
import { ProjectCard } from './ProjectCard.tsx';
import { ProjectFormDialog } from './ProjectFormDialog.tsx';
import { useProjects } from './api.ts';

export function ProjectsPage() {
  const [creando, setCreando] = useState(false);
  const proyectos = useProjects();

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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

      {proyectos.data && proyectos.data.length > 0 && (
        <>
          {/* Solo para lectores de pantalla: anuncia la recarga de fondo sin
              tapar ni mover nada de lo que ya está en pantalla. */}
          <span aria-live="polite" className="sr-only">
            {proyectos.isFetching ? 'Actualizando proyectos' : ''}
          </span>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {proyectos.data.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        </>
      )}

      {creando && <ProjectFormDialog open onClose={() => setCreando(false)} />}
    </div>
  );
}

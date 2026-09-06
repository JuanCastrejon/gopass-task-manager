import { useState } from 'react';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { Link, navigate } from '../../lib/router.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { ProgressBar } from '../../components/ui/ProgressBar.tsx';
import { ErrorState, Skeleton } from '../../components/ui/States.tsx';
import { messageFor } from '../../lib/error-messages.ts';
import { ProjectFormDialog } from './ProjectFormDialog.tsx';
import { DeleteProjectDialog } from './DeleteProjectDialog.tsx';
import { useProject } from './api.ts';
import { TaskBoard } from '../tasks/TaskBoard.tsx';

/** Detalle del proyecto: cabecera con el avance y, debajo, el tablero de tareas. */
export function ProjectDetailPage({ projectId }: { projectId: string }) {
  const [editando, setEditando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const proyecto = useProject(projectId);

  return (
    <div className="space-y-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Volver a proyectos
      </Link>

      {proyecto.isPending && (
        <div className="space-y-3 rounded-xl border border-border bg-surface p-5">
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-3 w-full max-w-md" />
          <Skeleton className="h-1.5 w-full rounded-full" />
        </div>
      )}

      {proyecto.isError && (
        <ErrorState message={messageFor(proyecto.error)} onRetry={() => void proyecto.refetch()} />
      )}

      {proyecto.data && (
        <>
          <header className="rounded-xl border border-border bg-surface p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-tight sm:truncate">
                  {proyecto.data.name}
                </h1>
                <p className="mt-1 text-sm text-ink-muted">
                  {proyecto.data.description ?? 'Sin descripción'}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                {/* El nombre accesible dice QUÉ se edita o elimina: «Editar»
                    a secas es ambiguo en una página donde también hay
                    acciones sobre tareas. */}
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label="Editar proyecto"
                  onClick={() => setEditando(true)}
                >
                  <Pencil className="size-3.5" aria-hidden />
                  Editar
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  aria-label="Eliminar proyecto"
                  onClick={() => setBorrando(true)}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  Eliminar
                </Button>
              </div>
            </div>

            <div className="mt-5 space-y-1.5">
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-ink-muted">
                  {proyecto.data.taskCount === 0
                    ? 'Sin tareas'
                    : `${proyecto.data.doneCount} de ${proyecto.data.taskCount} completadas`}
                </span>
                <span className="font-medium tabular-nums">{proyecto.data.progress}%</span>
              </div>
              <ProgressBar value={proyecto.data.progress} label="Avance del proyecto" />
            </div>
          </header>

          <TaskBoard projectId={projectId} wipLimit={proyecto.data.wipLimit} />

          {editando && (
            <ProjectFormDialog open onClose={() => setEditando(false)} project={proyecto.data} />
          )}
          {borrando && (
          <DeleteProjectDialog
            open
            onClose={() => setBorrando(false)}
            project={proyecto.data}
            // Tras borrarlo, quedarse en su detalle mostraría un 404: se
            // vuelve al listado.
            onDeleted={() => navigate('/')}
          />
          )}
        </>
      )}
    </div>
  );
}

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

/** Detalle del proyecto: cabecera con el avance y espacio reservado para tareas. */
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
                  variant="ghost"
                  size="sm"
                  aria-label="Eliminar proyecto"
                  className="text-danger hover:bg-danger-soft hover:text-danger"
                  onClick={() => setBorrando(true)}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  Eliminar
                </Button>
              </div>
            </div>

            <div className="mt-5 space-y-2">
              <div className="flex items-center justify-between text-xs text-ink-muted">
                <span>Avance global del proyecto</span>
                <span className="font-medium text-ink">{proyecto.data.progress}%</span>
              </div>
              <ProgressBar value={proyecto.data.progress} />
              <div className="flex gap-4 text-xs text-ink-muted">
                <span>
                  {proyecto.data.taskCount}{' '}
                  {proyecto.data.taskCount === 1 ? 'tarea en total' : 'tareas en total'}
                </span>
                <span>•</span>
                <span>{proyecto.data.doneCount} completadas</span>
              </div>
            </div>
          </header>

          {/* Espacio reservado para el tablero de tareas (SL-06) */}
          <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-ink-muted">
            <p className="font-medium text-ink">Tablero de Tareas</p>
            <p className="mt-1 text-sm">El tablero Kanban de 3 columnas (TODO, IN_PROGRESS, DONE) y filtros se integrará en el siguiente slice de tareas.</p>
          </div>

          {editando && (
            <ProjectFormDialog open onClose={() => setEditando(false)} project={proyecto.data} />
          )}
          {borrando && (
            <DeleteProjectDialog
              open
              onClose={() => setBorrando(false)}
              project={proyecto.data}
              onDeleted={() => navigate('/')}
            />
          )}
        </>
      )}
    </div>
  );
}

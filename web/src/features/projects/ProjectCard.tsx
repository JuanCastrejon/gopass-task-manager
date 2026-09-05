import { useState } from 'react';
import { ArrowRight, Pencil, Trash2 } from 'lucide-react';
import { Link } from '../../lib/router.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { ProgressBar } from '../../components/ui/ProgressBar.tsx';
import { ProjectFormDialog } from './ProjectFormDialog.tsx';
import { DeleteProjectDialog } from './DeleteProjectDialog.tsx';
import type { ProjectSummary } from '../../types/api.ts';

export function ProjectCard({ project }: { project: ProjectSummary }) {
  const [editando, setEditando] = useState(false);
  const [borrando, setBorrando] = useState(false);

  return (
    // `flex-col` con `mt-auto` en el pie: las tarjetas de una misma fila
    // quedan alineadas aunque unas tengan descripción y otras no.
    <article className="flex flex-col rounded-xl border border-border bg-surface p-5 transition hover:border-brand/40">
      <div className="flex items-start justify-between gap-3">
        <h3 className="truncate text-sm font-semibold" title={project.name}>
          {project.name}
        </h3>
        <div className="flex shrink-0 gap-0.5">
          <Button variant="ghost" size="sm" onClick={() => setEditando(true)} aria-label={`Editar ${project.name}`}>
            <Pencil className="size-3.5" aria-hidden />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setBorrando(true)} aria-label={`Eliminar ${project.name}`}>
            <Trash2 className="size-3.5" aria-hidden />
          </Button>
        </div>
      </div>

      {/* Altura mínima reservada aunque no haya descripción, para que la
          retícula no quede escalonada. */}
      <p className="mt-1.5 line-clamp-2 min-h-[2.5rem] text-sm text-ink-muted">
        {project.description ?? 'Sin descripción'}
      </p>

      <div className="mt-auto space-y-1.5 pt-4">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-ink-muted">
            {project.taskCount === 0
              ? 'Sin tareas'
              : `${project.doneCount} de ${project.taskCount} completadas`}
          </span>
          <span className="font-medium tabular-nums">{project.progress}%</span>
        </div>
        <ProgressBar value={project.progress} label={`Avance de ${project.name}`} />
      </div>

      <Link
        to={`/projects/${project.id}`}
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
      >
        Ver tareas
        <ArrowRight className="size-3.5" aria-hidden />
      </Link>

      {/* Montados solo cuando se abren. Renderizarlos siempre metía dos
          `<dialog>` por tarjeta en el documento: con cuatro proyectos había
          nueve, todos con los mismos `id`, así que cada `<label htmlFor>`
          apuntaba al campo del primero y `aria-labelledby` anunciaba siempre
          el mismo título. */}
      {editando && (
        <ProjectFormDialog open onClose={() => setEditando(false)} project={project} />
      )}
      {borrando && (
        <DeleteProjectDialog open onClose={() => setBorrando(false)} project={project} />
      )}
    </article>
  );
}

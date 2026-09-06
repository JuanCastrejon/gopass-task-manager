import { useEffect } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Modal } from '../../components/ui/Modal.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { messageFor } from '../../lib/error-messages.ts';
import { useDeleteProject } from './api.ts';
import type { ProjectSummary } from '../../types/api.ts';

interface Props {
  open: boolean;
  onClose: () => void;
  project: ProjectSummary;
  onDeleted?: () => void;
}

/**
 * Confirmación antes de borrar, y el 409 explicado **dentro** de este mismo
 * diálogo.
 *
 * Por qué sigue habiendo confirmación aunque el servidor proteja: el 409 solo
 * cubre los proyectos con tareas. Uno vacío se borra de verdad al primer clic.
 *
 * Por qué el botón de eliminar de la tarjeta no se deshabilita cuando
 * `taskCount > 0`: un botón muerto no explica nada y se apoya en un contador
 * que puede estar desactualizado. Dejándolo activo, el usuario intenta la
 * acción y **ve la regla de integridad**, que es justamente lo que hay que
 * demostrar.
 */
export function DeleteProjectDialog({ open, onClose, project, onDeleted }: Props) {
  const remove = useDeleteProject();

  useEffect(() => {
    if (open) remove.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project.id]);

  return (
    <Modal open={open} onClose={onClose} title="Eliminar proyecto">
      <p className="text-sm text-ink-muted">
        ¿Seguro que quieres eliminar <strong className="text-ink">{project.name}</strong>? Esta
        acción no se puede deshacer.
      </p>

      {project.taskCount > 0 && !remove.isError && (
        <p className="mt-3 text-sm text-ink-muted">
          El proyecto tiene {project.taskCount}{' '}
          {project.taskCount === 1 ? 'tarea asociada' : 'tareas asociadas'}.
        </p>
      )}

      {remove.isError && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2.5 rounded-lg bg-danger-soft px-3 py-2.5 text-sm text-danger"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{messageFor(remove.error, 'No se pudo eliminar el proyecto.')}</span>
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          variant="danger"
          loading={remove.isPending}
          onClick={() =>
            remove.mutate(project.id, {
              onSuccess: () => {
                onClose();
                onDeleted?.();
              },
            })
          }
        >
          Eliminar
        </Button>
      </div>
    </Modal>
  );
}

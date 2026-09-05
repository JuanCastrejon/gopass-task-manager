import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from '../../components/ui/Modal.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { PRIORITY_LABEL, STATUS_LABEL } from '../../components/ui/Badge.tsx';
import { fieldErrors, messageFor } from '../../lib/error-messages.ts';
import { TASK_PRIORITIES, TASK_STATUSES, type Task, type TaskPriority, type TaskStatus } from '../../types/api.ts';
import { useCreateTask, useUpdateTask } from './api.ts';

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  /** Ausente para crear; presente para editar. */
  task?: Task;
  /** Columna desde la que se pulsó «añadir», para preseleccionar el estado. */
  defaultStatus?: TaskStatus;
}

export function TaskFormDialog({ open, onClose, projectId, task, defaultStatus }: Props) {
  const editing = task !== undefined;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('TODO');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');

  const create = useCreateTask(projectId);
  const update = useUpdateTask();
  const mutation = editing ? update : create;

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? '');
    setDescription(task?.description ?? '');
    setStatus(task?.status ?? defaultStatus ?? 'TODO');
    setPriority(task?.priority ?? 'MEDIUM');
    mutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id, defaultStatus]);

  const errores = fieldErrors(mutation.error);
  const tituloVacio = title.trim().length === 0;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    // `isPending` tarda un ciclo de render en deshabilitar el botón, así que un
    // doble clic rápido enviaba dos peticiones: la primera creaba el recurso y
    // la segunda chocaba con el índice único y devolvía un 409 desconcertante
    // sobre algo que en realidad sí se había guardado.
    if (mutation.isPending) return;
    if (tituloVacio) return;

    const limpio = description.trim();
    if (editing) {
      update.mutate(
        { id: task.id, patch: { title: title.trim(), description: limpio === '' ? null : limpio, status, priority } },
        { onSuccess: onClose },
      );
    } else {
      create.mutate(
        { title: title.trim(), status, priority, ...(limpio === '' ? {} : { description: limpio }) },
        { onSuccess: onClose },
      );
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar tarea' : 'Nueva tarea'}>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="task-title" className="mb-1.5 block text-sm font-medium">
            Título
          </label>
          <input
            id="task-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            data-autofocus
            aria-invalid={errores['title'] !== undefined || undefined}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
            placeholder="Homologar lectores del corredor norte"
          />
          {errores['title'] && <p className="mt-1 text-xs text-danger">{errores['title']}</p>}
        </div>

        <div>
          <label htmlFor="task-description" className="mb-1.5 block text-sm font-medium">
            Descripción <span className="font-normal text-ink-muted">(opcional)</span>
          </label>
          <textarea
            id="task-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="task-status" className="mb-1.5 block text-sm font-medium">
              Estado
            </label>
            <select
              id="task-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="task-priority" className="mb-1.5 block text-sm font-medium">
              Prioridad
            </label>
            <select
              id="task-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
            >
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {mutation.isError && Object.keys(errores).length === 0 && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {messageFor(mutation.error)}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" loading={mutation.isPending} disabled={tituloVacio}>
            {editing ? 'Guardar cambios' : 'Crear tarea'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

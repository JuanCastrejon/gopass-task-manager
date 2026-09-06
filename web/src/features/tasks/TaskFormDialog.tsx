import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from '../../components/ui/Modal.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { LABEL_STYLE, PRIORITY_LABEL } from '../../components/ui/Badge.tsx';
import { fieldErrors, messageFor } from '../../lib/error-messages.ts';
import {
  TASK_PRIORITIES,
  type ProjectColumnSummary,
  type Task,
  type TaskPriority,
} from '../../types/api.ts';
import { useLabels, useSetTaskLabels } from '../labels/api.ts';
import { useCreateTask, useUpdateTask } from './api.ts';
import { evaluarCompletado } from './due-date.ts';

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  /** Ausente para crear; presente para editar. */
  task?: Task;
  /** Las columnas del tablero, ya ordenadas por posición. */
  columnas: ProjectColumnSummary[];
  /** Columna desde la que se pulsó «añadir», para preseleccionarla. */
  defaultColumnId?: string;
}

export function TaskFormDialog({
  open,
  onClose,
  projectId,
  task,
  columnas,
  defaultColumnId,
}: Props) {
  const editing = task !== undefined;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [columnId, setColumnId] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [dueDate, setDueDate] = useState('');
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);

  const { data: labels = [] } = useLabels(projectId);
  const setTaskLabels = useSetTaskLabels();
  const create = useCreateTask(projectId);
  const update = useUpdateTask();
  const mutation = editing ? update : create;

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? '');
    setDescription(task?.description ?? '');
    setColumnId(task?.columnId ?? defaultColumnId ?? columnas[0]?.id ?? '');
    setPriority(task?.priority ?? 'MEDIUM');
    setDueDate(task?.dueDate ?? '');
    setSelectedLabelIds(task?.labels?.map((l) => l.id) ?? []);
    mutation.reset();
    setTaskLabels.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id, defaultColumnId]);

  const errores = fieldErrors(mutation.error);
  const tituloVacio = title.trim().length === 0;
  const submitting = mutation.isPending || setTaskLabels.isPending;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (tituloVacio) return;

    const limpio = description.trim();
    if (editing) {
      update.mutate(
        {
          id: task.id,
          patch: {
            title: title.trim(),
            description: limpio === '' ? null : limpio,
            columnId,
            priority,
            dueDate: dueDate === '' ? null : dueDate,
          },
        },
        {
          onSuccess: (updatedTask) => {
            setTaskLabels.mutate(
              { taskId: updatedTask.id, labelIds: [] },
              { onSuccess: onClose },
            );
          },
        },
      );
    } else {
      create.mutate(
        {
          title: title.trim(),
          columnId,
          priority,
          dueDate: dueDate === '' ? null : dueDate,
          ...(limpio === '' ? {} : { description: limpio }),
        },
        {
          onSuccess: (createdTask) => {
            if (selectedLabelIds.length > 0) {
              setTaskLabels.mutate(
                { taskId: createdTask.id, labelIds: selectedLabelIds },
                { onSuccess: onClose },
              );
            } else {
              onClose();
            }
          },
        },
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
            {/* Antes decía «Estado» y ofrecía los tres del dominio. Ahora dice
                «Columna» y ofrece las del tablero: el estado se deriva de la
                columna, no al revés, y con varias columnas de la misma
                categoría solo el nombre distingue a cuál va.

                Es además la vía de salto directo entre columnas no contiguas:
                las flechas de la tarjeta llegan a cualquiera paso a paso
                —suficiente para WCAG 2.5.7— y este desplegable evita el paseo
                sin robar sitio en cada tarjeta. */}
            <label htmlFor="task-column" className="mb-1.5 block text-sm font-medium">
              Columna
            </label>
            <select
              id="task-column"
              value={columnId}
              onChange={(e) => setColumnId(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
            >
              {columnas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
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

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="task-due-date" className="block text-sm font-medium">
              Fecha de vencimiento <span className="font-normal text-ink-muted">(opcional)</span>
            </label>
            {editing && task.status === 'DONE' && (
              (() => {
                const estado = evaluarCompletado(task.completedAt, dueDate || null);
                if (estado === 'a_tiempo') {
                  return (
                    <span className="inline-flex items-center gap-1 rounded bg-status-done-soft px-2 py-0.5 text-[11px] font-medium text-status-done">
                      Completada a tiempo
                    </span>
                  );
                }
                if (estado === 'tarde') {
                  return (
                    <span className="inline-flex items-center gap-1 rounded bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-danger">
                      Completada tarde
                    </span>
                  );
                }
                return null;
              })()
            )}
          </div>
          <input
            type="date"
            id="task-due-date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            aria-invalid={errores['dueDate'] !== undefined || undefined}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
          {errores['dueDate'] && <p className="mt-1 text-xs text-danger">{errores['dueDate']}</p>}
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-medium">
            Etiquetas <span className="font-normal text-ink-muted">(opcional)</span>
          </span>
          {labels.length === 0 ? (
            <p className="text-xs text-ink-muted">No hay etiquetas creadas en este proyecto.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Seleccionar etiquetas">
              {labels.map((lbl) => {
                const seleccionada = selectedLabelIds.includes(lbl.id);
                return (
                  <button
                    key={lbl.id}
                    type="button"
                    role="checkbox"
                    aria-checked={seleccionada}
                    onClick={() => {
                      setSelectedLabelIds((prev) =>
                        seleccionada ? prev.filter((id) => id !== lbl.id) : [...prev, lbl.id],
                      );
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                      seleccionada
                        ? `${LABEL_STYLE[lbl.color]} ring-2 ring-brand ring-offset-1`
                        : 'border border-border bg-surface text-ink-muted hover:bg-canvas'
                    }`}
                  >
                    <span
                      className={`size-2 rounded-full ${
                        seleccionada ? 'bg-current' : 'border border-ink-muted/40'
                      }`}
                      aria-hidden
                    />
                    <span>{lbl.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {(mutation.isError || setTaskLabels.isError) && Object.keys(errores).length === 0 && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {messageFor(mutation.error ?? setTaskLabels.error)}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" loading={submitting} disabled={tituloVacio}>
            {editing ? 'Guardar cambios' : 'Crear tarea'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

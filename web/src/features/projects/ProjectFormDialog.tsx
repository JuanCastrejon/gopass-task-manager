import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from '../../components/ui/Modal.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { fieldErrors, messageFor } from '../../lib/error-messages.ts';
import { useCreateProject, useUpdateProject } from './api.ts';
import {
  BOARD_BACKGROUND_CLASSES,
  PROJECT_BACKGROUND_NAMES,
  PROJECT_BACKGROUNDS,
  type ProjectBackground,
  type ProjectSummary,
} from '../../types/api.ts';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Ausente para crear; presente para editar. */
  project?: ProjectSummary;
}

const MAX_NAME = 120;

export function ProjectFormDialog({ open, onClose, project }: Props) {
  const editing = project !== undefined;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [background, setBackground] = useState<ProjectBackground>(project?.background ?? 'neutro');

  const create = useCreateProject();
  const update = useUpdateProject(project?.id ?? '');
  const mutation = editing ? update : create;

  // Al abrir se recargan los valores y se limpia el error del intento
  // anterior: reabrir un diálogo no debe mostrar el fallo de la vez pasada.
  useEffect(() => {
    if (!open) return;
    setName(project?.name ?? '');
    setDescription(project?.description ?? '');
    setBackground(project?.background ?? 'neutro');
    mutation.reset();
    // `mutation` cambia de identidad en cada render; depender de él aquí
    // reiniciaría el formulario mientras se escribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project?.id, project?.background]);

  const errores = fieldErrors(mutation.error);
  const nombreVacio = name.trim().length === 0;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    // `isPending` tarda un ciclo de render en deshabilitar el botón, así que un
    // doble clic rápido enviaba dos peticiones: la primera creaba el recurso y
    // la segunda chocaba con el índice único y devolvía un 409 desconcertante
    // sobre algo que en realidad sí se había guardado.
    if (mutation.isPending) return;
    if (nombreVacio) return;

    const limpio = description.trim();

    if (editing) {
      // En edición se envía `null` cuando la descripción se vació: el PATCH
      // distingue "no lo toques" (ausente) de "bórralo" (null explícito). El
      // límite sigue la misma regla.
      update.mutate(
        { name: name.trim(), description: limpio === '' ? null : limpio, background },
        { onSuccess: onClose },
      );
    } else {
      create.mutate(
        { name: name.trim(), ...(limpio === '' ? {} : { description: limpio }), background },
        { onSuccess: onClose },
      );
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar proyecto' : 'Nuevo proyecto'}>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="project-name" className="mb-1.5 block text-sm font-medium">
            Nombre
          </label>
          <input
            id="project-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_NAME}
            data-autofocus
            aria-invalid={errores['name'] !== undefined || undefined}
            aria-describedby={errores['name'] ? 'project-name-error' : undefined}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm
                       outline-none focus:border-brand"
            placeholder="Telepeaje — integración de operadores"
          />
          <div className="mt-1 flex items-start justify-between gap-3">
            <span id="project-name-error" className="text-xs text-danger">
              {errores['name']}
            </span>
            <span className="shrink-0 text-xs text-ink-muted tabular-nums">
              {name.length}/{MAX_NAME}
            </span>
          </div>
        </div>

        <div>
          <label htmlFor="project-description" className="mb-1.5 block text-sm font-medium">
            Descripción <span className="font-normal text-ink-muted">(opcional)</span>
          </label>
          <textarea
            id="project-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm
                       outline-none focus:border-brand"
            placeholder="Qué abarca este proyecto"
          />
        </div>

        <div>
          <label id="project-background-label" className="mb-1.5 block text-sm font-medium">
            Fondo del tablero
          </label>
          <div
            role="radiogroup"
            aria-labelledby="project-background-label"
            className="grid grid-cols-3 gap-2 sm:grid-cols-6"
          >
            {PROJECT_BACKGROUNDS.map((bg) => {
              const seleccionado = background === bg;
              return (
                <button
                  key={bg}
                  type="button"
                  role="radio"
                  aria-checked={seleccionado}
                  aria-label={PROJECT_BACKGROUND_NAMES[bg]}
                  onClick={() => setBackground(bg)}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border p-2 text-xs font-medium transition ${
                    seleccionado
                      ? 'border-brand ring-2 ring-brand ring-offset-1 text-ink font-semibold'
                      : 'border-border bg-surface text-ink-muted hover:border-ink-muted/30 hover:text-ink'
                  }`}
                >
                  <span
                    className={`size-6 rounded-md border border-border shadow-xs ${BOARD_BACKGROUND_CLASSES[bg]}`}
                    aria-hidden
                  />
                  <span className="truncate">{PROJECT_BACKGROUND_NAMES[bg]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Errores que no son de un campo concreto: el 409 de nombre repetido
            es el caso típico. */}
        {mutation.isError && Object.keys(errores).length === 0 && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {messageFor(mutation.error)}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" loading={mutation.isPending} disabled={nombreVacio}>
            {editing ? 'Guardar cambios' : 'Crear proyecto'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

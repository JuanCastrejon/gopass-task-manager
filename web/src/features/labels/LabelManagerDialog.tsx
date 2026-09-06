import { useState, type FormEvent } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Modal } from '../../components/ui/Modal.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { LabelBadge } from '../../components/ui/Badge.tsx';
import { messageFor } from '../../lib/error-messages.ts';
import {
  LABEL_COLORS,
  LABEL_COLOR_NAMES,
  type Label,
  type LabelColor,
} from '../../types/api.ts';
import { useCreateLabel, useDeleteLabel, useLabels, useUpdateLabel } from './api.ts';

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
}

/**
 * Diálogo de gestión de etiquetas por proyecto (SL-18).
 *
 * Permite listar las etiquetas con su color y conteo de tareas asociadas,
 * crear etiquetas nuevas (1-30 caracteres con paleta cerrada de 12 colores),
 * editar nombre o color en línea, y eliminar con confirmación y advertencia explícita
 * de cuántas tareas perderán la etiqueta cuando está en uso.
 */
export function LabelManagerDialog({ open, onClose, projectId }: Props) {
  const { data: labels = [], isLoading } = useLabels(projectId);
  const crear = useCreateLabel(projectId);
  const actualizar = useUpdateLabel(projectId);
  const borrar = useDeleteLabel(projectId);

  const [nombre, setNombre] = useState('');
  const [color, setColor] = useState<LabelColor>('blue');

  // Estado para la etiqueta que se está editando en línea
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editColor, setEditColor] = useState<LabelColor>('blue');

  // Etiqueta pendiente de confirmación para borrado cuando tiene tareas
  const [aBorrar, setABorrar] = useState<Label | null>(null);

  const error = crear.error ?? actualizar.error ?? borrar.error;
  const ocupado = crear.isPending || actualizar.isPending || borrar.isPending;

  function anadir(event: FormEvent) {
    event.preventDefault();
    if (ocupado || nombre.trim() === '') return;
    crear.mutate(
      { name: nombre.trim(), color },
      {
        onSuccess: () => {
          setNombre('');
          setColor('blue');
        },
      },
    );
  }

  function iniciarEdicion(label: Label) {
    setEditandoId(label.id);
    setEditNombre(label.name);
    setEditColor(label.color);
  }

  function guardarEdicion(id: string) {
    const limpio = editNombre.trim();
    if (!limpio) return;
    actualizar.mutate(
      { id, patch: { name: limpio, color: editColor } },
      {
        onSuccess: () => setEditandoId(null),
      },
    );
  }

  function pedirBorrado(label: Label) {
    const tareas = label.taskCount ?? 0;
    if (tareas === 0) {
      borrar.mutate({ id: label.id, confirm: false });
      return;
    }
    setABorrar(label);
  }

  function confirmarBorradoConTareas() {
    if (!aBorrar) return;
    borrar.mutate(
      { id: aBorrar.id, confirm: true },
      { onSuccess: () => setABorrar(null) },
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Etiquetas del proyecto">
      <div className="space-y-4">
        {/* Listado de etiquetas existentes */}
        {isLoading ? (
          <p className="py-4 text-center text-xs text-ink-muted">Cargando etiquetas...</p>
        ) : labels.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-4 text-center text-xs text-ink-muted">
            No hay etiquetas en este proyecto aún.
          </p>
        ) : (
          <ul className="max-h-60 space-y-2 overflow-y-auto pr-1" data-testid="label-list">
            {labels.map((lbl) => {
              const esEditando = editandoId === lbl.id;
              const tareas = lbl.taskCount ?? 0;

              return (
                <li
                  key={lbl.id}
                  data-testid={`label-item-${lbl.id}`}
                  className="flex items-center gap-2 rounded-lg border border-border bg-surface p-2"
                >
                  {esEditando ? (
                    <div className="flex flex-1 items-center gap-2">
                      <input
                        value={editNombre}
                        onChange={(e) => setEditNombre(e.target.value)}
                        maxLength={30}
                        aria-label="Nombre de etiqueta"
                        className="min-w-0 flex-1 rounded border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-brand"
                      />
                      <select
                        value={editColor}
                        onChange={(e) => setEditColor(e.target.value as LabelColor)}
                        aria-label="Color de etiqueta"
                        className="rounded border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-brand"
                      >
                        {LABEL_COLORS.map((c) => (
                          <option key={c} value={c}>
                            {LABEL_COLOR_NAMES[c]}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Guardar cambios de etiqueta"
                        onClick={() => guardarEdicion(lbl.id)}
                        disabled={!editNombre.trim() || ocupado}
                      >
                        <Check className="size-3.5 text-status-done" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Cancelar edición"
                        onClick={() => setEditandoId(null)}
                      >
                        <X className="size-3.5 text-ink-muted" aria-hidden />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <LabelBadge label={lbl} />
                      <span className="min-w-0 flex-1" />
                      <span
                        className="shrink-0 text-xs tabular-nums text-ink-muted"
                        title={`${tareas} ${tareas === 1 ? 'tarea asociada' : 'tareas asociadas'}`}
                      >
                        {tareas} {tareas === 1 ? 'tarea' : 'tareas'}
                      </span>
                      <div className="flex shrink-0 gap-0.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={ocupado}
                          aria-label={`Editar etiqueta ${lbl.name}`}
                          onClick={() => iniciarEdicion(lbl)}
                        >
                          <Pencil className="size-3.5" aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={ocupado}
                          aria-label={`Eliminar etiqueta ${lbl.name}`}
                          onClick={() => pedirBorrado(lbl)}
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </Button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* Advertencia de confirmación al borrar etiqueta con tareas */}
        {aBorrar && (
          <div
            data-testid="label-delete-confirm-box"
            className="space-y-2 rounded-lg bg-danger-soft p-3 text-sm text-danger"
          >
            <p>
              La etiqueta <strong>«{aBorrar.name}»</strong> está asignada a{' '}
              <strong>{aBorrar.taskCount}</strong>{' '}
              {aBorrar.taskCount === 1 ? 'tarea' : 'tareas'}. Si la eliminas, estas tareas perderán la
              etiqueta.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                variant="danger"
                size="sm"
                loading={borrar.isPending}
                onClick={confirmarBorradoConTareas}
              >
                Eliminar de todas las tareas
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setABorrar(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {/* Formulario para añadir nueva etiqueta */}
        <form
          onSubmit={anadir}
          className="flex flex-wrap items-end gap-2 border-t border-border pt-4"
        >
          <div className="min-w-0 flex-1">
            <label htmlFor="nueva-etiqueta-nombre" className="mb-1.5 block text-sm font-medium">
              Nueva etiqueta
            </label>
            <input
              id="nueva-etiqueta-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={30}
              placeholder="p. ej. Urgente, Frontend..."
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </div>

          <div>
            <label htmlFor="nueva-etiqueta-color" className="mb-1.5 block text-sm font-medium">
              Color
            </label>
            <select
              id="nueva-etiqueta-color"
              value={color}
              onChange={(e) => setColor(e.target.value as LabelColor)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
            >
              {LABEL_COLORS.map((c) => (
                <option key={c} value={c}>
                  {LABEL_COLOR_NAMES[c]}
                </option>
              ))}
            </select>
          </div>

          <Button
            type="submit"
            variant="primary"
            loading={crear.isPending}
            disabled={nombre.trim() === ''}
          >
            <Plus className="size-4" aria-hidden />
            Añadir
          </Button>
        </form>

        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {messageFor(error)}
          </p>
        )}
      </div>
    </Modal>
  );
}

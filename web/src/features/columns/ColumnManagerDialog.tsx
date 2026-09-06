import { useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Modal } from '../../components/ui/Modal.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { STATUS_LABEL, StatusDot } from '../../components/ui/Badge.tsx';
import { messageFor } from '../../lib/error-messages.ts';
import { TASK_STATUSES, type ProjectColumnSummary, type TaskStatus } from '../../types/api.ts';
import { useCreateColumn, useDeleteColumn, useReorderColumns, useUpdateColumn } from './api.ts';

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  columnas: ProjectColumnSummary[];
}

/**
 * Gestión de las columnas del tablero.
 *
 * Vive en un diálogo y no en la propia cabecera de cada columna: renombrar,
 * reordenar y borrar son operaciones de configuración, poco frecuentes y con
 * consecuencias, y ponerlas al alcance de un clic en el tablero invita a
 * tocarlas sin querer mientras se trabaja. El único control de columna que se
 * queda fuera es el de orden, porque ese sí se cambia a diario.
 */
export function ColumnManagerDialog({ open, onClose, projectId, columnas }: Props) {
  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState<TaskStatus>('IN_PROGRESS');
  /** Columna cuyo borrado se está resolviendo, con su destino elegido. */
  const [aBorrar, setABorrar] = useState<{ columna: ProjectColumnSummary; destino: string } | null>(
    null,
  );

  const crear = useCreateColumn(projectId);
  const actualizar = useUpdateColumn(projectId);
  const borrar = useDeleteColumn(projectId);
  const reordenar = useReorderColumns(projectId);

  const error = crear.error ?? actualizar.error ?? borrar.error ?? reordenar.error;
  const ocupado =
    crear.isPending || actualizar.isPending || borrar.isPending || reordenar.isPending;

  function anadir(event: FormEvent) {
    event.preventDefault();
    if (ocupado || nombre.trim() === '') return;
    crear.mutate(
      { name: nombre.trim(), category: categoria },
      { onSuccess: () => setNombre('') },
    );
  }

  /** Mover una columna una posición: se envía el orden completo, no un desplazamiento. */
  function mover(desde: number, hasta: number) {
    if (ocupado || hasta < 0 || hasta >= columnas.length) return;
    const ids = columnas.map((c) => c.id);
    const [movida] = ids.splice(desde, 1);
    ids.splice(hasta, 0, movida!);
    reordenar.mutate(ids);
  }

  function pedirBorrado(columna: ProjectColumnSummary) {
    if (columna.taskCount === 0) {
      borrar.mutate({ id: columna.id });
      return;
    }
    // Con tareas dentro no hay borrado a ciegas: se pregunta a dónde van, y
    // el destino por defecto es la primera columna que no sea esta.
    const destino = columnas.find((c) => c.id !== columna.id)?.id ?? '';
    setABorrar({ columna, destino });
  }

  return (
    <Modal open={open} onClose={onClose} title="Columnas del tablero">
      <div className="space-y-4">
        <ul className="space-y-2">
          {columnas.map((col, indice) => (
            <li
              key={col.id}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface p-2"
            >
              <StatusDot status={col.category} />

              {/* Renombrar en el sitio: abrir un segundo diálogo para cambiar
                  una palabra sería desproporcionado. Se guarda al salir del
                  campo, no en cada tecla. */}
              <input
                defaultValue={col.name}
                maxLength={60}
                disabled={ocupado}
                aria-label={`Nombre de la columna ${col.name}`}
                onBlur={(e) => {
                  const valor = e.target.value.trim();
                  if (valor !== '' && valor !== col.name) {
                    actualizar.mutate({ id: col.id, patch: { name: valor } });
                  } else {
                    e.target.value = col.name;
                  }
                }}
                className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1.5 py-1 text-sm outline-none hover:border-border focus:border-brand"
              />

              {/* El límite no aplica a una columna terminal: limitar lo ya
                  terminado no significa nada. */}
              {col.category !== 'DONE' && (
                <input
                  type="number"
                  min={1}
                  max={100}
                  defaultValue={col.wipLimit ?? ''}
                  disabled={ocupado}
                  placeholder="—"
                  aria-label={`Límite de trabajo en curso de ${col.name}`}
                  title="Máximo de tareas simultáneas. Vacío es sin límite."
                  onBlur={(e) => {
                    const valor = e.target.value.trim() === '' ? null : Number(e.target.value);
                    if (valor !== col.wipLimit) {
                      actualizar.mutate({ id: col.id, patch: { wipLimit: valor } });
                    }
                  }}
                  className="w-14 shrink-0 rounded border border-border bg-surface px-1.5 py-1 text-center text-xs outline-none focus:border-brand"
                />
              )}

              <span className="w-8 shrink-0 text-right text-xs tabular-nums text-ink-muted">
                {col.taskCount}
              </span>

              <div className="flex shrink-0 gap-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={indice === 0 || ocupado}
                  aria-label={`Subir ${col.name}`}
                  onClick={() => mover(indice, indice - 1)}
                >
                  <ArrowUp className="size-3.5" aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={indice === columnas.length - 1 || ocupado}
                  aria-label={`Bajar ${col.name}`}
                  onClick={() => mover(indice, indice + 1)}
                >
                  <ArrowDown className="size-3.5" aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={ocupado}
                  aria-label={`Eliminar ${col.name}`}
                  onClick={() => pedirBorrado(col)}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>

        {/* No es un callejón sin salida: si la columna tiene tareas, se ofrece
            a dónde moverlas en la misma operación en vez de exigir vaciarla a
            mano primero. */}
        {aBorrar && (
          <div className="space-y-2 rounded-lg bg-danger-soft p-3">
            <p className="text-sm text-danger">
              «{aBorrar.columna.name}» tiene {aBorrar.columna.taskCount}{' '}
              {aBorrar.columna.taskCount === 1 ? 'tarea' : 'tareas'}. ¿A qué columna se mueven?
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={aBorrar.destino}
                onChange={(e) => setABorrar({ ...aBorrar, destino: e.target.value })}
                aria-label="Columna de destino"
                className="rounded border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-brand"
              >
                {columnas
                  .filter((c) => c.id !== aBorrar.columna.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
              <Button
                variant="danger"
                size="sm"
                loading={borrar.isPending}
                onClick={() =>
                  borrar.mutate(
                    { id: aBorrar.columna.id, reassignTo: aBorrar.destino },
                    { onSuccess: () => setABorrar(null) },
                  )
                }
              >
                Mover y eliminar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setABorrar(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        <form onSubmit={anadir} className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
          <div className="min-w-0 flex-1">
            <label htmlFor="columna-nombre" className="mb-1.5 block text-sm font-medium">
              Nueva columna
            </label>
            <input
              id="columna-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={60}
              placeholder="En revisión"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </div>
          <div>
            <label htmlFor="columna-categoria" className="mb-1.5 block text-sm font-medium">
              Tipo
            </label>
            {/* La categoría no se puede cambiar después: hacerlo movería el
                estado de todas sus tareas por efecto colateral, sellando o
                borrando fechas de completado que nadie pidió tocar. Por eso se
                elige aquí y se explica. */}
            <select
              id="columna-categoria"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value as TaskStatus)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
            >
              {TASK_STATUSES.map((c) => (
                <option key={c} value={c}>
                  {STATUS_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="primary" loading={crear.isPending} disabled={nombre.trim() === ''}>
            <Plus className="size-4" aria-hidden />
            Añadir
          </Button>
        </form>

        <p className="text-xs text-ink-muted">
          El tipo decide cómo cuenta la columna para el avance del proyecto y para el panel, y no se
          puede cambiar después. Las tareas de una columna de tipo «Completada» quedan marcadas como
          terminadas.
        </p>

        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {messageFor(error)}
          </p>
        )}
      </div>
    </Modal>
  );
}

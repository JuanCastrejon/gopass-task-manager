import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { StatusDot } from '../../components/ui/Badge.tsx';
import { messageFor } from '../../lib/error-messages.ts';
import type { ProjectColumnSummary } from '../../types/api.ts';
import { columnKeys, useUpdateColumn } from '../columns/api.ts';

interface CabeceraColumnaProps {
  projectId: string;
  columna: ProjectColumnSummary;
  arrastrando: boolean;
  recuentoActual: number;
}

/**
 * Cabecera de cada columna del tablero con renombrado en el sitio (SL-21).
 *
 * Marcado y semántica:
 * `<h3><button type="button">Nombre</button></h3>` que conmuta a `<input>` al activarse.
 *
 * Los dos revisores independientes descartaron por separado las dos alternativas:
 * - `contenteditable`: errático en React, inserta `<div>` y `<br>` al pulsar Enter, y es
 *   difícil de sincronizar con el estado.
 * - Un `<input>` permanente con aspecto de texto: rompe la jerarquía de encabezados que los
 *   lectores de pantalla usan como puntos de referencia, y añade un punto de tabulación vacío
 *   por cada columna del tablero.
 *
 * Gesto:
 * Pulsación simple sobre el título. Ni doble clic —no es fiable en táctil, provoca retardo o zoom—
 * ni `hover`, que en un móvil no existe. Tampoco icono de lápiz aparte: la cabecera mide 272 px
 * y ya lleva el punto de categoría, el contador, el indicador de límite y el selector de orden.
 *
 * Guardar y cancelar:
 * - Enter guarda.
 * - Escape cancela restaurando el valor previo.
 * - blur guarda si el valor cambió y no queda vacío tras recortar espacios (tocar fuera es el gesto
 *   natural de confirmación en un móvil, y descartar en blur destruiría lo escrito por accidente).
 * - Si tras recortar queda vacío o idéntico al original, no se envía ninguna petición.
 *
 * Conflicto de nombre:
 * El nombre es único por proyecto y la API responde 409. El campo permanece abierto con el foco
 * dentro, `aria-invalid="true"`, y el mensaje aparece en una región con `role="alert"`.
 * Cerrar el campo perdería lo tecleado.
 *
 * Convivencia con el arrastre:
 * - La cabecera es zona soltable del tablero: la columna entera es el contenedor `useDroppable`.
 * - Al arrastrar una tarjeta (`arrastrando === true`), el botón queda deshabilitado para que soltar
 *   sobre el título no active accidentalmente la edición.
 * - Dentro del input, se detiene la propagación de eventos de puntero en fase de captura para
 *   que la selección o desplazamiento de cursor en el texto no interfiera con los sensores de dnd-kit.
 */
export function CabeceraColumna({
  projectId,
  columna,
  arrastrando,
  recuentoActual,
}: CabeceraColumnaProps) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(columna.name);
  const [valor, setValor] = useState(columna.name);
  const [error, setError] = useState<string | null>(null);

  const botonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fueEditandoRef = useRef(false);
  const cancelandoRef = useRef(false);
  const guardandoRef = useRef(false);

  const queryClient = useQueryClient();
  const actualizar = useUpdateColumn(projectId);

  const prevNombrePropRef = useRef(columna.name);

  // Sincronizar el nombre cuando cambie desde el exterior (ej. refetch del servidor)
  useEffect(() => {
    if (prevNombrePropRef.current !== columna.name) {
      prevNombrePropRef.current = columna.name;
      setNombre(columna.name);
      if (!editando) {
        setValor(columna.name);
      }
    }
  }, [columna.name, editando]);

  // Al activar: se monta el <input>, el foco se transfiere y el texto queda seleccionado.
  // Al salir: se restaura el encabezado y el foco vuelve al botón.
  useEffect(() => {
    if (editando) {
      inputRef.current?.focus();
      inputRef.current?.select();
      fueEditandoRef.current = true;
    } else if (fueEditandoRef.current) {
      fueEditandoRef.current = false;
      botonRef.current?.focus();
    }
  }, [editando]);

  function activarEdicion() {
    if (arrastrando) return;
    setError(null);
    setValor(nombre);
    setEditando(true);
  }

  function cancelar() {
    cancelandoRef.current = true;
    setError(null);
    setValor(nombre);
    setEditando(false);
  }

  function guardar() {
    if (guardandoRef.current) return;
    const limpio = valor.trim();

    // Si tras recortar queda vacío o idéntico al original, no se envía ninguna petición
    if (limpio === '' || limpio === nombre) {
      setError(null);
      setValor(nombre);
      setEditando(false);
      return;
    }

    guardandoRef.current = true;
    actualizar.mutate(
      { id: columna.id, patch: { name: limpio } },
      {
        onSuccess: () => {
          guardandoRef.current = false;
          setError(null);
          setNombre(limpio);
          setValor(limpio);
          setEditando(false);

          // Actualización inmediata en caché para respuesta instantánea antes del refetch
          queryClient.setQueryData<ProjectColumnSummary[]>(
            columnKeys.byProject(projectId),
            (prev) => prev?.map((c) => (c.id === columna.id ? { ...c, name: limpio } : c)),
          );
        },
        onError: (err) => {
          guardandoRef.current = false;
          setError(messageFor(err));
          // El campo permanece abierto con el foco dentro
          requestAnimationFrame(() => {
            inputRef.current?.focus();
          });
        },
      },
    );
  }

  function handleBlur() {
    if (cancelandoRef.current) {
      cancelandoRef.current = false;
      return;
    }
    if (guardandoRef.current || !editando) return;
    guardar();
  }

  return (
    <header className="mb-2 px-0.5">
      <div className="flex items-center gap-1.5">
        {/* El punto sigue el color de la CATEGORÍA, no del nombre */}
        <StatusDot status={columna.category} />

        {editando ? (
          <input
            ref={inputRef}
            type="text"
            value={valor}
            maxLength={60}
            aria-label={`Nombre de la columna ${nombre}`}
            aria-invalid={error ? 'true' : undefined}
            onChange={(e) => {
              setValor(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                guardar();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelar();
              }
            }}
            onBlur={handleBlur}
            onPointerDownCapture={(e) => e.stopPropagation()}
            onMouseDownCapture={(e) => e.stopPropagation()}
            onTouchStartCapture={(e) => e.stopPropagation()}
            className={`min-w-0 flex-1 rounded border bg-surface px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-ink outline-none focus:border-brand ${
              error ? 'border-danger ring-1 ring-danger' : 'border-border'
            }`}
          />
        ) : (
          <h3
            className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide text-ink-muted"
            title={nombre}
          >
            <button
              ref={botonRef}
              type="button"
              disabled={arrastrando}
              onClick={activarEdicion}
              /**
               * `aria-label` y no `title`.
               *
               * El botón tiene texto visible —el nombre de la columna—, y ese
               * texto **gana** sobre `title` al calcular el nombre accesible.
               * Con `title`, un lector de pantalla anunciaba «Por hacer,
               * botón»: un control cuyo propósito no se puede adivinar. Y
               * `title` solo se ve al pasar el ratón, gesto que en un móvil no
               * existe.
               *
               * La etiqueta incluye el nombre visible, así que se sigue
               * cumpliendo WCAG 2.5.3 «Label in Name»: quien dicta por voz
               * puede decir «Por hacer» y el control responde.
               */
              aria-label={`Renombrar columna: ${nombre}`}
              className="max-w-full truncate text-left font-semibold uppercase tracking-wide text-ink-muted hover:text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-brand rounded transition-colors"
            >
              {nombre}
            </button>
          </h3>
        )}

        {columna.wipLimit !== null ? (
          <span
            className={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-xs font-medium tabular-nums ${
              recuentoActual >= columna.wipLimit
                ? 'bg-danger-soft text-danger'
                : 'text-ink-muted'
            }`}
            title={`${recuentoActual} de un máximo de ${columna.wipLimit} en ${nombre}`}
          >
            {recuentoActual}/{columna.wipLimit}
          </span>
        ) : (
          <span className="ml-auto shrink-0 text-xs tabular-nums text-ink-muted">
            {recuentoActual}
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-1 text-[11px] font-medium text-danger">
          {error}
        </p>
      )}
    </header>
  );
}

import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { TASK_PRIORITIES, type TaskPriority } from '../../types/api.ts';
import { PRIORITY_LABEL } from './Badge.tsx';

/**
 * Los dos controles de filtrado, sin lógica dentro.
 *
 * Son primitivos de presentación a propósito: no leen la URL, no saben qué se
 * filtra ni con qué predicado. El comportamiento vive en `useFiltrosDeUrl`, y
 * cada pantalla compone su propia barra con estas piezas. Así el tablero y el
 * panel comparten el aspecto y la accesibilidad sin compartir una abstracción
 * que tendría que conocer los dos dominios.
 */

export function CampoBusqueda({
  value,
  onChange,
  ariaLabel,
  placeholder = 'Buscar',
}: {
  value: string;
  onChange: (valor: string) => void;
  /** Qué se busca. «Buscar» a secas no dice nada en una página con dos listas. */
  ariaLabel: string;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-muted"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="h-8 w-40 rounded-lg border border-border bg-surface pl-8 pr-2.5 text-xs outline-none focus:border-brand"
      />
    </div>
  );
}

/**
 * `aria-pressed` y no `aria-selected`: es un botón de dos estados, no una
 * opción dentro de un `listbox`. Un lector de pantalla anuncia «Alta, botón,
 * pulsado», que es exactamente lo que está pasando.
 */
/**
 * El grupo «Todas · Baja · Media · Alta».
 *
 * Se extrae porque las dos pantallas lo pintan igual y con las mismas
 * etiquetas; lo único que cambia entre ellas es qué significa el filtro, y eso
 * se dice en `ariaLabel`. Tres props y ninguna de dominio: si algún día
 * necesitara saber *qué* se está filtrando, habría que devolverlo a cada
 * página en lugar de añadirle banderas.
 */
export function GrupoDePrioridad({
  valor,
  onChange,
  ariaLabel,
}: {
  valor: TaskPriority | null;
  onChange: (valor: TaskPriority | null) => void;
  ariaLabel: string;
}) {
  return (
    <div className="flex gap-1" role="group" aria-label={ariaLabel}>
      <FiltroChip activo={valor === null} onClick={() => onChange(null)}>
        Todas
      </FiltroChip>
      {TASK_PRIORITIES.map((p) => (
        <FiltroChip key={p} activo={valor === p} onClick={() => onChange(p)}>
          {PRIORITY_LABEL[p]}
        </FiltroChip>
      ))}
    </div>
  );
}

export function FiltroChip({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`h-8 rounded-lg px-2.5 text-xs font-medium transition ${
        activo
          ? 'bg-brand text-white'
          : 'border border-border bg-surface text-ink-muted hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

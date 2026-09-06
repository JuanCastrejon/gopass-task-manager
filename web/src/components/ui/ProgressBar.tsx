interface Props {
  value: number;
  label?: string;
}

/**
 * `role="progressbar"` con sus `aria-value*`: un lector de pantalla anuncia el
 * porcentaje sin depender de que el número esté además escrito al lado.
 */
export function ProgressBar({ value, label }: Props) {
  const pct = Math.min(100, Math.max(0, value));
  const tone = pct === 100 ? 'bg-status-done' : pct > 0 ? 'bg-brand' : 'bg-border';

  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? `Avance ${pct}%`}
      className="h-1.5 w-full overflow-hidden rounded-full bg-canvas"
    >
      <div
        className={`h-full rounded-full transition-[width] duration-300 ${tone}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

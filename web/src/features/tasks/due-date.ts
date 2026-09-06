/**
 * Lógica pura de cálculo de semáforo y estado de fechas de vencimiento (SL-17).
 *
 * El estado de vencimiento se calcula en el cliente contra la fecha local del navegador
 * inyectada como parámetro, sin depender del reloj del sistema dentro de la función pura.
 * Esto permite pruebas deterministas sin falsear el reloj global.
 *
 * Se usa formato de fecha puro YYYY-MM-DD sin componente horario para evitar los 5 horas
 * de desfase entre el servidor UTC y usuarios en Bogotá (GMT-05:00).
 */

export type DueDateStatus =
  | 'vencida'
  | 'vence_hoy'
  | 'vence_pronto'
  | 'con_tiempo'
  | 'completada'
  | 'sin_fecha';

export interface DueDateResult {
  status: DueDateStatus;
  label: string;
  ariaLabel: string;
  className: string;
  diffDays: number | null;
}

function parseYmd(ymd: string): [number, number, number] {
  const parts = ymd.split('-');
  const y = Number(parts[0]) || 0;
  const m = Number(parts[1]) || 1;
  const d = Number(parts[2]) || 1;
  return [y, m, d];
}

/** Formatea una fecha YYYY-MM-DD a formato corto en español (ej. "12 mar"). */
export function formatDueDateShort(dueDate: string): string {
  const [y, m, d] = parseYmd(dueDate);
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
    .format(date)
    .replace('.', '');
}

/** Formatea una fecha YYYY-MM-DD a formato largo accesible en español (ej. "12 de marzo"). */
export function formatDueDateLong(dueDate: string): string {
  const [y, m, d] = parseYmd(dueDate);
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(date);
}

/**
 * Calcula la diferencia en días naturales entre dueDate y today.
 *
 * Se convierten ambos extremos a UTC medianoche de sus respectivos días de calendario,
 * eliminando desviaciones por DST o por la hora del día.
 */
export function calcularDiferenciaDias(
  dueDate: string,
  today: string | Date = new Date(),
): number {
  const [dueY, dueM, dueD] = parseYmd(dueDate);
  const dueUtc = Date.UTC(dueY, dueM - 1, dueD);

  let todayUtc: number;
  if (typeof today === 'string') {
    const [todayY, todayM, todayD] = parseYmd(today);
    todayUtc = Date.UTC(todayY, todayM - 1, todayD);
  } else {
    todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  }

  const MS_PER_DAY = 86_400_000;
  return Math.round((dueUtc - todayUtc) / MS_PER_DAY);
}

/**
 * Semáforo puro de fecha de vencimiento:
 *
 * Reglas de diseño (SL-17):
 * - La insignia se muestra siempre que la tarea tenga fecha.
 * - Completada gana siempre: se atenúa y deja de alarmar, tenga la fecha que tenga.
 * - Vencida: fecha anterior a hoy (diffDays < 0).
 * - Vence hoy: fecha igual a hoy (diffDays === 0).
 * - Vence pronto: dentro de los próximos 3 días naturales (1 <= diffDays <= 3).
 * - Con tiempo: resto de fechas futuras (diffDays > 3).
 * - Nunca solo color: siempre lleva texto legible y nombre accesible para lector de pantalla.
 */
export function calcularEstadoVencimiento(
  dueDate: string | null | undefined,
  isDone: boolean,
  today: string | Date = new Date(),
): DueDateResult {
  if (!dueDate) {
    return {
      status: 'sin_fecha',
      label: '',
      ariaLabel: '',
      className: '',
      diffDays: null,
    };
  }

  const diffDays = calcularDiferenciaDias(dueDate, today);
  const fechaCorta = formatDueDateShort(dueDate);
  const fechaLarga = formatDueDateLong(dueDate);

  // Completada gana siempre: la insignia se atenúa y deja de alarmar
  if (isDone) {
    return {
      status: 'completada',
      label: fechaCorta,
      ariaLabel: `Fecha de vencimiento: ${fechaLarga} (tarea completada)`,
      className: 'bg-canvas text-ink-muted/70 border border-border/80',
      diffDays,
    };
  }

  // Vencida: anterior a hoy
  if (diffDays < 0) {
    return {
      status: 'vencida',
      label: `Vencida · ${fechaCorta}`,
      ariaLabel: `Fecha de vencimiento: ${fechaLarga} (vencida)`,
      className: 'bg-danger-soft text-danger border border-danger/20',
      diffDays,
    };
  }

  // Vence hoy
  if (diffDays === 0) {
    return {
      status: 'vence_hoy',
      label: `Vence hoy · ${fechaCorta}`,
      ariaLabel: `Fecha de vencimiento: ${fechaLarga} (vence hoy)`,
      className: 'bg-status-progress-soft text-status-progress border border-status-progress/20',
      diffDays,
    };
  }

  // Vence pronto: dentro de los próximos 3 días naturales, hoy excluido (1 a 3)
  if (diffDays <= 3) {
    return {
      status: 'vence_pronto',
      label: `Vence pronto · ${fechaCorta}`,
      ariaLabel: `Fecha de vencimiento: ${fechaLarga} (vence pronto)`,
      className: 'bg-status-progress-soft text-status-progress border border-status-progress/20',
      diffDays,
    };
  }

  // Con tiempo: más de 3 días en el futuro
  return {
    status: 'con_tiempo',
    label: fechaCorta,
    ariaLabel: `Fecha de vencimiento: ${fechaLarga}`,
    className: 'bg-canvas text-ink-muted border border-border',
    diffDays,
  };
}

/**
 * Evalúa si una tarea completada se terminó a tiempo o tarde.
 *
 * Se compara en el CLIENTE la fecha local de `completedAt` contra `dueDate`.
 * Hacerlo en SQL mezclaría `date` con `timestamptz` y reintroduciría el huso del
 * servidor por la puerta de atrás.
 */
export function evaluarCompletado(
  completedAt: string | null | undefined,
  dueDate: string | null | undefined,
): 'a_tiempo' | 'tarde' | null {
  if (!completedAt || !dueDate) return null;

  const d = new Date(completedAt);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const localCompletedDate = `${year}-${month}-${day}`;

  return localCompletedDate <= dueDate ? 'a_tiempo' : 'tarde';
}

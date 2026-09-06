import { describe, expect, it } from 'vitest';
import {
  calcularDiferenciaDias,
  calcularEstadoVencimiento,
  evaluarCompletado,
  formatDueDateLong,
  formatDueDateShort,
} from '../due-date.ts';

describe('lógica pura de fecha de vencimiento (SL-17)', () => {
  // Fecha inyectada fija: Viernes 4 de septiembre de 2026
  const hoyFijo = '2026-09-04';

  describe('formateo de fechas sin desfase', () => {
    it('formatea fechas cortas en español', () => {
      expect(formatDueDateShort('2026-03-12')).toBe('12 mar');
      expect(formatDueDateShort('2026-09-04')).toBe('4 sept');
    });

    it('formatea fechas largas accesibles en español', () => {
      expect(formatDueDateLong('2026-03-12')).toBe('12 de marzo');
    });
  });

  describe('cálculo de diferencia en días naturales', () => {
    it('calcula días negativos para fechas pasadas', () => {
      expect(calcularDiferenciaDias('2026-09-03', hoyFijo)).toBe(-1);
      expect(calcularDiferenciaDias('2026-08-31', hoyFijo)).toBe(-4);
    });

    it('calcula 0 para la fecha de hoy', () => {
      expect(calcularDiferenciaDias('2026-09-04', hoyFijo)).toBe(0);
    });

    it('calcula días positivos para fechas futuras', () => {
      expect(calcularDiferenciaDias('2026-09-05', hoyFijo)).toBe(1);
      // Viernes a lunes son 3 días naturales
      expect(calcularDiferenciaDias('2026-09-07', hoyFijo)).toBe(3);
      expect(calcularDiferenciaDias('2026-09-08', hoyFijo)).toBe(4);
    });
  });

  describe('semáforo de estados de vencimiento con fecha inyectada', () => {
    it('1. estado vencida — due_date anterior a hoy', () => {
      const res = calcularEstadoVencimiento('2026-09-03', false, hoyFijo);
      expect(res.status).toBe('vencida');
      expect(res.label).toBe('Vencida · 3 sept');
      expect(res.ariaLabel).toContain('vencida');
      expect(res.className).toContain('text-danger');
      expect(res.diffDays).toBe(-1);
    });

    it('2. estado vence hoy — due_date igual a hoy', () => {
      const res = calcularEstadoVencimiento('2026-09-04', false, hoyFijo);
      expect(res.status).toBe('vence_hoy');
      expect(res.label).toBe('Vence hoy · 4 sept');
      expect(res.ariaLabel).toContain('vence hoy');
      expect(res.className).toContain('text-status-progress');
      expect(res.diffDays).toBe(0);
    });

    it('3. estado dentro de 3 días — vence pronto (incluye el lunes avisado el viernes)', () => {
      // Sábado (+1 día)
      const resSabado = calcularEstadoVencimiento('2026-09-05', false, hoyFijo);
      expect(resSabado.status).toBe('vence_pronto');
      expect(resSabado.label).toBe('Vence pronto · 5 sept');
      expect(resSabado.diffDays).toBe(1);

      // Lunes (+3 días naturales desde el viernes)
      const resLunes = calcularEstadoVencimiento('2026-09-07', false, hoyFijo);
      expect(resLunes.status).toBe('vence_pronto');
      expect(resLunes.label).toBe('Vence pronto · 7 sept');
      expect(resLunes.diffDays).toBe(3);
      expect(resLunes.className).toContain('text-status-progress');
    });

    it('4. estado con tiempo — más de 3 días naturales en el futuro', () => {
      const res = calcularEstadoVencimiento('2026-09-08', false, hoyFijo);
      expect(res.status).toBe('con_tiempo');
      // No lleva prefijo de alarma, solo la fecha
      expect(res.label).toBe('8 sept');
      expect(res.className).toContain('text-ink-muted');
      expect(res.diffDays).toBe(4);
    });

    it('5. estado completada — gana siempre y deja de alarmar', () => {
      // Tarea completada cuya fecha ya pasó (estaría vencida si estuviera abierta)
      const resVencidaPeroHecha = calcularEstadoVencimiento('2026-08-15', true, hoyFijo);
      expect(resVencidaPeroHecha.status).toBe('completada');
      // La insignia no alarma con "Vencida", solo muestra la fecha atenuada
      expect(resVencidaPeroHecha.label).toBe('15 ago');
      expect(resVencidaPeroHecha.ariaLabel).toContain('completada');
      expect(resVencidaPeroHecha.className).toContain('text-ink-muted/70');

      // Tarea completada que vencía hoy
      const resHoyPeroHecha = calcularEstadoVencimiento('2026-09-04', true, hoyFijo);
      expect(resHoyPeroHecha.status).toBe('completada');
      expect(resHoyPeroHecha.label).toBe('4 sept');
    });

    it('6. sin fecha — devuelve estado neutral sin insignia', () => {
      const resNull = calcularEstadoVencimiento(null, false, hoyFijo);
      expect(resNull.status).toBe('sin_fecha');
      expect(resNull.label).toBe('');

      const resUndefined = calcularEstadoVencimiento(undefined, false, hoyFijo);
      expect(resUndefined.status).toBe('sin_fecha');
      expect(resUndefined.label).toBe('');
    });
  });

  describe('evaluarCompletado (a tiempo vs tarde)', () => {
    it('devuelve a_tiempo cuando se completó en o antes de la fecha de vencimiento', () => {
      // Completada el mismo día
      expect(evaluarCompletado('2026-09-04T12:00:00Z', '2026-09-04')).toBe('a_tiempo');
      // Completada días antes
      expect(evaluarCompletado('2026-09-01T10:00:00Z', '2026-09-04')).toBe('a_tiempo');
    });

    it('devuelve tarde cuando se completó después de la fecha de vencimiento', () => {
      expect(evaluarCompletado('2026-09-05T08:00:00Z', '2026-09-04')).toBe('tarde');
    });

    it('devuelve null si falta completedAt o dueDate', () => {
      expect(evaluarCompletado(null, '2026-09-04')).toBeNull();
      expect(evaluarCompletado('2026-09-04T12:00:00Z', null)).toBeNull();
      expect(evaluarCompletado(null, null)).toBeNull();
    });
  });
});

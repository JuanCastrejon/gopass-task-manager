import { describe, expect, it } from 'vitest';
import { ApiError } from '../api-client.ts';
import { fieldErrors, messageFor } from '../error-messages.ts';

/**
 * Regresiones de la estabilización (D2-3). Cada caso corresponde a un defecto
 * que se reprodujo de verdad antes de arreglarlo.
 */
describe('messageFor', () => {
  it('traduce el code, que es el contrato estable', () => {
    const err = new ApiError(409, { type: '', title: 'x', status: 409, code: 'PROJECT_HAS_TASKS' }, 'x');
    expect(messageFor(err)).toContain('todavía tiene tareas');
  });

  it('cae en el detail del servidor ante un code que el frontend no conoce', () => {
    const err = new ApiError(400, { type: '', title: 'x', status: 400, code: 'CODIGO_FUTURO', detail: 'Explicación del servidor.' }, 'x');
    expect(messageFor(err)).toBe('Explicación del servidor.');
  });

  it('distingue "sin conexión" de "error del servidor"', () => {
    expect(messageFor(new ApiError(0, null, 'x'))).toContain('No hay conexión');
  });

  it('un 502 sin problem+json dice que el servidor no está disponible', () => {
    // El cuerpo de un 502 de nginx es HTML: `problem` llega como null.
    expect(messageFor(new ApiError(502, null, 'x'))).toContain('no está disponible');
  });

  it('un error que no es de la API cae al respaldo', () => {
    expect(messageFor(new Error('boom'), 'respaldo')).toBe('respaldo');
  });
});

describe('fieldErrors', () => {
  it('indexa los errores por campo para pintarlos junto a su input', () => {
    const err = new ApiError(400, {
      type: '', title: 'x', status: 400, code: 'VALIDATION_ERROR',
      errors: [{ path: 'name', message: 'vacío' }],
    }, 'x');
    expect(fieldErrors(err)).toEqual({ name: 'vacío' });
  });

  it('devuelve un objeto vacío cuando no hay desglose', () => {
    expect(fieldErrors(new ApiError(500, null, 'x'))).toEqual({});
  });
});

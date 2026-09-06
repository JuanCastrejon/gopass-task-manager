import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFiltrosDeUrl } from '../use-filtros-de-url.ts';

/**
 * El hook que comparten el tablero de tareas y el panel de proyectos.
 *
 * Lo que se prueba aquí no es que escriba en la URL —eso se ve a simple
 * vista—, sino la condición de carrera entre el retardo del buscador y los
 * chips de prioridad, que ya se coló una vez en el tablero. Al pasar a dos
 * pantallas, esta prueba es lo que impide reintroducirla.
 */

const parametros = () => new URLSearchParams(window.location.search);

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useFiltrosDeUrl', () => {
  it('escribe la búsqueda en la URL solo después del retardo', () => {
    const { result } = renderHook(() => useFiltrosDeUrl());

    act(() => result.current.setBusqueda('telepeaje'));

    // Antes de que venza: lo tecleado ya se ve, la URL todavía no.
    expect(result.current.busqueda).toBe('telepeaje');
    expect(parametros().get('q')).toBeNull();

    act(() => void vi.advanceTimersByTime(250));
    expect(parametros().get('q')).toBe('telepeaje');
  });

  it('un chip pulsado mientras se escribe sobrevive al temporizador pendiente', () => {
    const { result } = renderHook(() => useFiltrosDeUrl());

    act(() => result.current.setBusqueda('pago'));
    // Dentro de la ventana del retardo, con la escritura de `q` ya programada.
    act(() => void vi.advanceTimersByTime(100));
    act(() => result.current.cambiarPrioridad('HIGH'));

    // Aquí estaba el fallo: el temporizador tenía capturado un
    // `URLSearchParams` de antes del chip y lo reescribía sin la prioridad,
    // que se desmarcaba sola 250 ms después de pulsarla.
    act(() => void vi.advanceTimersByTime(250));

    expect(parametros().get('priority')).toBe('HIGH');
    expect(parametros().get('q')).toBe('pago');
  });

  it('refleja una URL que cambia por fuera, como al pulsar «atrás»', () => {
    const { result } = renderHook(() => useFiltrosDeUrl());

    act(() => result.current.setBusqueda('algo'));
    act(() => void vi.advanceTimersByTime(250));

    act(() => {
      window.history.replaceState(null, '', '/');
      window.dispatchEvent(new Event('app:navigate'));
    });

    // Sin la sincronización, el campo seguiría mostrando «algo» mientras la
    // lista ya se habría refrescado sin filtrar.
    expect(result.current.busqueda).toBe('');
    expect(result.current.hayFiltro).toBe(false);
  });

  it('limpiar borra los dos parámetros y deja la URL sin consulta', () => {
    const { result } = renderHook(() => useFiltrosDeUrl());

    act(() => result.current.setBusqueda('conciliación'));
    act(() => void vi.advanceTimersByTime(250));
    act(() => result.current.cambiarPrioridad('LOW'));
    expect(result.current.hayFiltro).toBe(true);

    act(() => result.current.limpiar());
    act(() => void vi.advanceTimersByTime(250));

    expect(window.location.search).toBe('');
    expect(result.current.hayFiltro).toBe(false);
  });

  it('no deja en la URL una búsqueda que solo tiene espacios', () => {
    const { result } = renderHook(() => useFiltrosDeUrl());

    act(() => result.current.setBusqueda('   '));
    act(() => void vi.advanceTimersByTime(250));

    expect(parametros().get('q')).toBeNull();
    expect(result.current.hayFiltro).toBe(false);
  });
});

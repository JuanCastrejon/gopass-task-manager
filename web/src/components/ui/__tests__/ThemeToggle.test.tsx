import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY } from '../../../lib/theme.ts';
import { ThemeToggle } from '../ThemeToggle.tsx';

describe('ThemeToggle (SL-19)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';

    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
      matches: false, // Por defecto sistema en claro
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('cambia el atributo data-theme a dark, persiste en localStorage y anuncia el cambio', () => {
    render(<ThemeToggle />);

    // El ciclo es fijo —claro, oscuro, sistema— y no depende del tema resuelto,
    // para que los tres estados sean alcanzables con cualquier sistema. Desde
    // 'system' el primer paso es 'light' y el segundo 'dark'.
    fireEvent.click(screen.getByRole('button', { name: /cambiar a tema claro/i }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    fireEvent.click(screen.getByRole('button', { name: /cambiar a tema oscuro/i }));

    // 1. El atributo en <html> cambió a "dark"
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');

    // 2. Se persistió en localStorage
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    // 3. Se actualizó el nombre accesible para la siguiente acción
    expect(screen.getByRole('button', { name: /cambiar a tema del sistema/i })).toBeDefined();

    // 4. La región viva anuncia el cambio realizado
    const anuncio = screen.getByRole('status');
    expect(anuncio.textContent).toBe('Tema cambiado a oscuro');
  });

  it('persiste la preferencia al remontar (simulación de recarga)', () => {
    // Supongamos que ya se guardó dark previamente
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');

    const { unmount } = render(<ThemeToggle />);

    // Guardado 'dark', el siguiente paso del ciclo fijo es 'system'.
    expect(screen.getByRole('button', { name: /cambiar a tema del sistema/i })).toBeDefined();

    unmount();

    // Remontamos simulando recarga de página
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: /cambiar a tema del sistema/i })).toBeDefined();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyThemeToDocument,
  getNextTheme,
  getNextThemeActionLabel,
  getStoredTheme,
  getThemeChangeAnnouncement,
  resolveTheme,
  THEME_STORAGE_KEY,
} from '../theme.ts';

describe('Gestión de tema claro/oscuro (SL-19)', () => {
  let mediaQueryMatches = false;
  let mediaQueryListeners: Array<() => void> = [];

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';
    mediaQueryMatches = false;
    mediaQueryListeners = [];

    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
      matches: mediaQueryMatches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((event: string, callback: () => void) => {
        if (event === 'change') {
          mediaQueryListeners.push(callback);
        }
      }),
      removeEventListener: vi.fn((event: string, callback: () => void) => {
        if (event === 'change') {
          mediaQueryListeners = mediaQueryListeners.filter((cb) => cb !== callback);
        }
      }),
      dispatchEvent: vi.fn(),
    })));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Sin preferencia guardada, se respeta prefers-color-scheme', () => {
    it('resuelve a "dark" cuando el sistema operativo tiene activado el tema oscuro', () => {
      mediaQueryMatches = true; // SO en oscuro
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();

      const preferencia = getStoredTheme();
      expect(preferencia).toBe('system');

      const temaResuelto = resolveTheme(preferencia);
      expect(temaResuelto).toBe('dark');
    });

    it('resuelve a "light" cuando el sistema operativo tiene activado el tema claro', () => {
      mediaQueryMatches = false; // SO en claro
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();

      const preferencia = getStoredTheme();
      expect(preferencia).toBe('system');

      const temaResuelto = resolveTheme(preferencia);
      expect(temaResuelto).toBe('light');
    });
  });

  describe('2. Con preferencia guardada, gana sobre la del sistema', () => {
    it('la preferencia guardada "light" gana aunque el sistema esté en "dark"', () => {
      mediaQueryMatches = true; // SO en oscuro
      localStorage.setItem(THEME_STORAGE_KEY, 'light');

      const preferencia = getStoredTheme();
      expect(preferencia).toBe('light');

      const temaResuelto = resolveTheme(preferencia);
      expect(temaResuelto).toBe('light');
    });

    it('la preferencia guardada "dark" gana aunque el sistema esté en "light"', () => {
      mediaQueryMatches = false; // SO en claro
      localStorage.setItem(THEME_STORAGE_KEY, 'dark');

      const preferencia = getStoredTheme();
      expect(preferencia).toBe('dark');

      const temaResuelto = resolveTheme(preferencia);
      expect(temaResuelto).toBe('dark');
    });
  });

  describe('3. Ciclo del conmutador y persistencia en el documento', () => {
    it('aplica el atributo data-theme y color-scheme en el elemento html', () => {
      applyThemeToDocument('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      expect(document.documentElement.style.colorScheme).toBe('dark');

      applyThemeToDocument('light');
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
      expect(document.documentElement.style.colorScheme).toBe('light');
    });

    it('cicla adecuadamente entre los tres estados y genera nombres y anuncios accesibles', () => {
      expect(getNextTheme('light')).toBe('dark');
      expect(getNextThemeActionLabel('dark')).toBe('Cambiar a tema oscuro');
      expect(getThemeChangeAnnouncement('dark')).toBe('Tema cambiado a oscuro');

      expect(getNextTheme('dark')).toBe('system');
      expect(getNextThemeActionLabel('system')).toBe('Cambiar a tema del sistema');
      expect(getThemeChangeAnnouncement('system')).toBe(
        'Tema cambiado a sincronizado con el sistema',
      );

      expect(getNextTheme('system')).toBe('light');
      expect(getNextThemeActionLabel('light')).toBe('Cambiar a tema claro');
      expect(getThemeChangeAnnouncement('light')).toBe('Tema cambiado a claro');
    });

    it('los tres estados son alcanzables, tenga el sistema el tema que tenga', () => {
      // Regresión. La primera versión decidía el siguiente estado a partir del
      // tema RESUELTO, no de la preferencia. Con el sistema en oscuro el ciclo
      // real era `system -> light -> system -> light`: 'dark' no tenía camino,
      // y quien tuviera el sistema en oscuro no podía fijar el tema oscuro.
      //
      // La prueba anterior no lo detectaba porque solo ejercitaba el caso con
      // el sistema en claro, que era la mitad que funcionaba. Esta recorre el
      // ciclo entero y comprueba que pasa por los tres.
      const visitados = new Set<string>();
      let actual: ReturnType<typeof getNextTheme> = 'system';
      for (let i = 0; i < 3; i += 1) {
        actual = getNextTheme(actual);
        visitados.add(actual);
      }

      expect(visitados).toEqual(new Set(['light', 'dark', 'system']));
    });
  });
});

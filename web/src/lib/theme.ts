import { useCallback, useEffect, useState } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'theme';

/**
 * Recupera la preferencia guardada en localStorage.
 *
 * Se utiliza localStorage porque el tema es una preferencia individual
 * por navegador/dispositivo, a diferencia del orden de columnas del tablero
 * que es configuración compartida del equipo guardada en el servidor.
 */
export function getStoredTheme(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  try {
    const valor = localStorage.getItem(THEME_STORAGE_KEY);
    if (valor === 'light' || valor === 'dark' || valor === 'system') {
      return valor;
    }
  } catch {
    // Si el acceso está bloqueado (entornos con cookies restringidas)
  }
  return 'system';
}

/**
 * Consulta la preferencia actual del sistema operativo.
 */
export function getSystemTheme(): ResolvedTheme {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

/**
 * Resuelve la preferencia activa a un tema concreto ('light' | 'dark').
 */
export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'system') {
    return getSystemTheme();
  }
  return preference;
}

/**
 * Aplica el tema en el DOM: fija `data-theme` y `color-scheme` en `<html>`.
 */
export function applyThemeToDocument(theme: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme;
}

/**
 * Determina el siguiente estado en el ciclo del conmutador de tres estados.
 *
 * El ciclo es **fijo**: claro → oscuro → sistema → claro. No depende del tema
 * que esté resuelto en ese momento, y esa es la corrección importante.
 *
 * Una primera versión saltaba desde 'system' al opuesto del tema activo. Con
 * el sistema operativo en oscuro, la secuencia real quedaba
 * `system → light → system → light`: **el estado 'dark' explícito era
 * inalcanzable**. Quien tuviera el sistema en oscuro no podía fijar el tema
 * oscuro, así que al cambiar el sistema a claro la aplicación le seguía en
 * contra de su preferencia. Se descubrió recorriendo el ciclo en el navegador,
 * no en las pruebas: los tres estados existían, pero uno no tenía camino.
 *
 * Un ciclo fijo cuesta un paso más a quien solo quiere alternar, y a cambio
 * garantiza que los tres estados son alcanzables desde cualquier sistema.
 */
export function getNextTheme(currentPreference: ThemePreference): ThemePreference {
  if (currentPreference === 'light') return 'dark';
  if (currentPreference === 'dark') return 'system';
  return 'light';
}

/**
 * Retorna la etiqueta accesible (acción) que describe a qué tema cambiará el control.
 */
export function getNextThemeActionLabel(nextTheme: ThemePreference): string {
  switch (nextTheme) {
    case 'dark':
      return 'Cambiar a tema oscuro';
    case 'light':
      return 'Cambiar a tema claro';
    case 'system':
      return 'Cambiar a tema del sistema';
  }
}

/**
 * Retorna el mensaje para la región viva (aria-live) anunciando el cambio realizado.
 */
export function getThemeChangeAnnouncement(newPreference: ThemePreference): string {
  switch (newPreference) {
    case 'dark':
      return 'Tema cambiado a oscuro';
    case 'light':
      return 'Tema cambiado a claro';
    case 'system':
      return 'Tema cambiado a sincronizado con el sistema';
  }
}

/**
 * Hook para gestionar el tema en componentes React.
 *
 * Si la preferencia está en 'system', se suscribe al evento 'change' de matchMedia
 * para reaccionar inmediatamente a los cambios del sistema operativo mientras
 * la aplicación permanezca abierta.
 */
export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(getStoredTheme);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(getStoredTheme()),
  );

  const setTheme = useCallback((newPreference: ThemePreference) => {
    setPreference(newPreference);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newPreference);
    } catch {
      // Ignorar si localStorage está restringido
    }
    const resolved = resolveTheme(newPreference);
    setResolvedTheme(resolved);
    applyThemeToDocument(resolved);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleSystemChange = () => {
      // Solo actualizamos si el usuario no ha forzado un tema explícito
      if (getStoredTheme() === 'system') {
        const newResolved = mediaQuery.matches ? 'dark' : 'light';
        setResolvedTheme(newResolved);
        applyThemeToDocument(newResolved);
      }
    };

    // Escucha eventos del sistema operativo en tiempo real
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleSystemChange);
      return () => mediaQuery.removeEventListener('change', handleSystemChange);
    }
  }, []);

  return {
    preference,
    resolvedTheme,
    setTheme,
  };
}

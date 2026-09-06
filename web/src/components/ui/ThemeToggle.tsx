import { useState } from 'react';
import { Laptop, Moon, Sun } from 'lucide-react';
import {
  getNextTheme,
  getNextThemeActionLabel,
  getThemeChangeAnnouncement,
  useTheme,
} from '../../lib/theme.ts';
import { Button } from './Button.tsx';

/**
 * Conmutador de tema de 3 estados (SL-19).
 *
 * Estados: 'system' -> 'dark' / 'light' -> 'light' / 'dark' -> 'system'.
 *
 * Accesibilidad (RNF-08):
 * - Control real (`<button>`) operable completamente mediante teclado.
 * - Nombre accesible dinámico (`aria-label`) que explicita la acción a la que cambia.
 * - Región viva (`aria-live="polite"`, `role="status"`) que anuncia de viva voz
 *   el nuevo tema seleccionado a usuarios de lectores de pantalla.
 */
export function ThemeToggle() {
  const { preference, resolvedTheme, setTheme } = useTheme();
  const [anuncio, setAnuncio] = useState('');

  const nextPreference = getNextTheme(preference);
  const actionLabel = getNextThemeActionLabel(nextPreference);

  const handleClick = () => {
    const next = getNextTheme(preference);
    setTheme(next);
    setAnuncio(getThemeChangeAnnouncement(next));
  };

  const Icon =
    preference === 'system' ? Laptop : preference === 'dark' ? Moon : Sun;

  const tooltip =
    preference === 'system'
      ? `Tema: Sistema (${resolvedTheme === 'dark' ? 'oscuro' : 'claro'})`
      : preference === 'dark'
        ? 'Tema: Oscuro'
        : 'Tema: Claro';

  return (
    <div className="relative inline-flex items-center">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleClick}
        aria-label={actionLabel}
        title={tooltip}
        data-testid="theme-toggle"
        className="px-2"
      >
        <Icon className="size-4" aria-hidden />
        <span className="sr-only">{actionLabel}</span>
      </Button>
      {/* Región viva para anunciar el cambio a tecnologías de asistencia */}
      <span className="sr-only" role="status" aria-live="polite">
        {anuncio}
      </span>
    </div>
  );
}

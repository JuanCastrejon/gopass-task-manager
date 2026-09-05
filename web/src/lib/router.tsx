import { useSyncExternalStore, type AnchorHTMLAttributes, type ReactNode } from 'react';

/**
 * Enrutado propio sobre la History API.
 *
 * La aplicación tiene dos vistas: el panel y el detalle de un proyecto. El
 * detalle tiene que ser direccionable —debe sobrevivir a una recarga y poder
 * compartirse—, así que hace falta enrutado de verdad, no un `useState` con
 * el nombre de la pantalla.
 *
 * Se midió el coste de `react-router-dom` en este bundle: +13.4 KB gzip, un
 * 22 % más, para dos rutas. Con la History API son estas líneas, y ni el
 * botón de atrás ni los enlaces compartibles ni abrir en pestaña nueva se
 * pierden. Entraría el día que aparezcan rutas anidadas, cargadores de datos
 * por ruta o navegación con bloqueo.
 *
 * `useSyncExternalStore` en vez de `useState` + `useEffect`: es la forma que
 * React 18 tiene para leer de una fuente externa —aquí, `window.location`—
 * sin desgarros entre componentes durante un render concurrente.
 */

const NAVIGATION_EVENT = 'app:navigate';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange);
  window.addEventListener(NAVIGATION_EVENT, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(NAVIGATION_EVENT, onChange);
  };
}

// La instantánea incluye la query, no solo la ruta: así los filtros del
// tablero viven en la URL y sobreviven a una recarga y a un enlace compartido.
const getSnapshot = (): string => window.location.pathname + window.location.search;

export function navigate(to: string): void {
  if (window.location.pathname + window.location.search === to) return;
  window.history.pushState(null, '', to);
  window.dispatchEvent(new Event(NAVIGATION_EVENT));
  window.scrollTo(0, 0);
}

export type Route = { name: 'projects' } | { name: 'projectDetail'; projectId: string };

const DETAIL = /^\/projects\/([0-9a-fA-F-]{36})\/?$/;

export function useRoute(): Route {
  const url = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const pathname = url.split('?')[0] ?? '/';
  const match = DETAIL.exec(pathname);
  // El id se valida en el propio patrón: una ruta con basura no llega a la
  // vista de detalle a provocar un 400 innecesario.
  return match?.[1] ? { name: 'projectDetail', projectId: match[1] } : { name: 'projects' };
}

/**
 * Parámetros de consulta como estado compartible.
 *
 * Se escribe con `replaceState` y no con `pushState`: teclear en un buscador
 * no debería llenar el historial de entradas ni obligar a pulsar «atrás»
 * quince veces para salir de la vista.
 */
export function useSearchParams(): [URLSearchParams, (next: URLSearchParams) => void] {
  const url = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const params = new URLSearchParams(url.split('?')[1] ?? '');

  const setParams = (next: URLSearchParams): void => {
    const qs = next.toString();
    const target = window.location.pathname + (qs ? `?${qs}` : '');
    if (target === window.location.pathname + window.location.search) return;
    window.history.replaceState(null, '', target);
    window.dispatchEvent(new Event(NAVIGATION_EVENT));
  };

  return [params, setParams];
}

interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string;
  children: ReactNode;
}

/**
 * Un `<a href>` real, no un `<div onClick>`. Así funcionan el clic central,
 * `Ctrl`/`Cmd`+clic, «abrir en pestaña nueva» y el menú contextual; el
 * `preventDefault` solo se aplica al clic izquierdo sin modificadores.
 */
export function Link({ to, children, onClick, ...rest }: LinkProps) {
  return (
    <a
      href={to}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

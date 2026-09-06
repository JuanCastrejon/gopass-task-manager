import { useEffect, useState } from 'react';
import { useSearchParams } from './router.tsx';
import type { TaskPriority } from '../types/api.ts';

/**
 * Los filtros de una lista, viviendo en la URL.
 *
 * Lo usan el tablero de tareas y el panel de proyectos. Las dos vistas ofrecen
 * el mismo par de controles —un buscador y un grupo de prioridades— y comparten
 * el mismo contrato de URL (`?q=` y `?priority=`), así que sobreviven a una
 * recarga y se pueden pasar por enlace.
 *
 * **Lo que se comparte es el comportamiento, no la presentación.** Este hook no
 * pinta nada: no sabe si se busca por título o por nombre, ni qué significa la
 * prioridad en cada pantalla. Esa fue la línea deliberada al extraerlo. Un
 * componente `<BarraDeFiltros>` que abarcara también el marcado habría
 * necesitado props para el `aria-label`, el texto del campo, la semántica del
 * chip y el predicado de filtrado; a partir de ahí conoce dos dominios y sale
 * más caro de leer que las dos copias que evita.
 */
export interface FiltrosDeUrl {
  /**
   * Lo tecleado ahora mismo. Va por delante de la URL: quien filtre en cliente
   * debe usar este valor, no `busquedaUrl`, o el resultado en pantalla llegaría
   * con el retardo del debounce y la lista parecería lenta.
   */
  busqueda: string;
  setBusqueda: (valor: string) => void;
  /**
   * Lo que hay escrito en la URL, ya con el retardo aplicado. Es lo que se le
   * pasa al servidor: sin él, cada tecla sería una petición.
   */
  busquedaUrl: string;
  prioridad: TaskPriority | null;
  cambiarPrioridad: (valor: TaskPriority | null) => void;
  /** Identificadores de etiquetas activas en el filtro de la URL (?labels=id1,id2) */
  etiquetas: string[];
  alternarEtiqueta: (id: string) => void;
  cambiarEtiquetas: (ids: string[]) => void;
  limpiar: () => void;
  hayFiltro: boolean;
}

/** Retardo antes de escribir en la URL. Una tecla no debería costar un viaje. */
const DEMORA_MS = 250;

export function useFiltrosDeUrl(): FiltrosDeUrl {
  const [params, setParams] = useSearchParams();
  const prioridad = params.get('priority') as TaskPriority | null;
  const busquedaUrl = params.get('q') ?? '';
  const etiquetasStr = params.get('labels') ?? '';
  const etiquetas = etiquetasStr
    ? etiquetasStr.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const [busqueda, setBusqueda] = useState(busquedaUrl);

  // La URL puede cambiar por fuera de este campo: el botón «atrás» del
  // navegador, o un enlace compartido. Sin esto, el input seguiría mostrando el
  // texto anterior mientras la lista ya se ha refrescado sin filtrar.
  useEffect(() => {
    setBusqueda(busquedaUrl);
  }, [busquedaUrl]);

  useEffect(() => {
    if (busqueda.trim() === busquedaUrl) return;
    const t = setTimeout(() => {
      escribir((next) => {
        if (busqueda.trim()) next.set('q', busqueda.trim());
        else next.delete('q');
      });
    }, DEMORA_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, busquedaUrl]);

  /**
   * Los parámetros se leen de `window.location` en el momento de escribir, no
   * del render que programó la escritura.
   *
   * Con la versión capturada en el cierre, activar un chip de prioridad
   * mientras se escribía hacía que el temporizador pendiente reescribiera la
   * URL sin esa prioridad, y el filtro se desmarcaba solo 250 ms después. El
   * fallo se reprodujo y se corrigió en el tablero; centralizarlo aquí es lo
   * que evita volver a introducirlo al añadir la segunda pantalla.
   */
  function escribir(mutar: (params: URLSearchParams) => void): void {
    const next = new URLSearchParams(window.location.search);
    mutar(next);
    setParams(next);
  }

  return {
    busqueda,
    setBusqueda,
    busquedaUrl,
    prioridad,
    cambiarPrioridad: (valor) =>
      escribir((next) => {
        if (valor) next.set('priority', valor);
        else next.delete('priority');
      }),
    etiquetas,
    alternarEtiqueta: (id: string) =>
      escribir((next) => {
        const actual = (next.get('labels') ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const yaExiste = actual.includes(id);
        const siguiente = yaExiste ? actual.filter((x) => x !== id) : [...actual, id];
        if (siguiente.length > 0) {
          next.set('labels', siguiente.join(','));
        } else {
          next.delete('labels');
        }
      }),
    cambiarEtiquetas: (ids: string[]) =>
      escribir((next) => {
        const limpias = ids.map((s) => s.trim()).filter(Boolean);
        if (limpias.length > 0) {
          next.set('labels', limpias.join(','));
        } else {
          next.delete('labels');
        }
      }),
    limpiar: () => {
      setBusqueda('');
      escribir((next) => {
        next.delete('q');
        next.delete('priority');
        next.delete('labels');
      });
    },
    // Se mide sobre lo tecleado y no sobre la URL: durante los 250 ms del
    // retardo el usuario ya cree estar filtrando, y el mensaje de «nada
    // coincide» debe hablar de lo que ve, no de lo que aún no se ha escrito.
    hayFiltro: busqueda.trim() !== '' || prioridad !== null || etiquetas.length > 0,
  };
}

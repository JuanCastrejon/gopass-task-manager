import {
  pointerWithin,
  closestCenter,
  type CollisionDetection,
} from '@dnd-kit/core';

export interface DatosColisionTablero {
  columnId: string;
  relativePosition: 'before' | 'after';
  esTarjeta: boolean;
}

/**
 * Detector de colisiones compuesto para el tablero Kanban (SL-20).
 *
 * Por qué no basta con el detector de serie (`closestCenter` o `rectIntersection`):
 * En una columna con pocas tarjetas (o una sola), el centro geométrico del contenedor
 * de la columna suele quedar más cerca de las coordenadas del puntero/elemento arrastrado
 * que el centro de su única tarjeta.
 *
 * Medición empírica que demostró el defecto:
 * Al soltar una tarjeta sobre el cuarto superior de la única tarjeta de la columna destino
 * (con orden manual y sin límites de WIP):
 *   - Con closestCenter: `over.id` se resolvió al ID de la COLUMNA y no al de la tarjeta.
 *   - En TaskBoard.tsx, la rama de la columna calculó `anterior = tareasDestino[ultimo]` -> MAX+1024,
 *     dando una posición resultante de 2048 (última) en vez de 512 (primera).
 *   - El cálculo de vecinas anterior/siguiente de la tarjeta nunca llegó a ejecutarse.
 *
 * Arquitectura del detector compuesto (dos fases en este orden específico):
 * 1. Primero `pointerWithin` acotado exclusivamente a los contenedores de columna:
 *    Identifica sobre qué columna física se encuentra el puntero del usuario. Si el puntero
 *    no se encuentra dentro de ninguna columna (por ejemplo, cabecera o bordes exteriores),
 *    devuelve un conjunto vacío para descartar el gesto y devolver la tarjeta a su origen.
 * 2. Segundo, acotar la resolución a los elementos `sortable` (tarjetas) de esa columna identificada:
 *    Si el puntero sobrevuela una tarjeta concreta de esa columna (`pointerWithin`), se resuelve
 *    dicha tarjeta como objetivo prioritario. Adicionalmente, calculamos si el puntero incide en
 *    la mitad superior ('before') o inferior ('after') para permitir una inserción precisa.
 * 3. Caída a la columna: solo si el puntero no sobrevuela ninguna tarjeta (columna vacía o espacio
 *    libre inferior debajo de las tarjetas), se resuelve el contenedor de la columna como fallback.
 */
export function crearDetectorTablero(obtenerColumnasIds: () => Set<string>): CollisionDetection {
  return (args) => {
    const { droppableContainers, droppableRects, pointerCoordinates } = args;

    // Sin coordenadas de puntero (por ejemplo, arrastre por teclado o sensores simulados),
    // se mantiene la compatibilidad de reserva con closestCenter.
    if (!pointerCoordinates) {
      return closestCenter(args);
    }

    const columnasIds = obtenerColumnasIds();

    // 1. Fase 1: Identificar sobre qué columna física está el puntero
    const contenedoresColumnas = droppableContainers.filter((c) =>
      columnasIds.has(String(c.id)),
    );

    const colisionesColumna = pointerWithin({
      ...args,
      droppableContainers: contenedoresColumnas,
    });

    if (colisionesColumna.length === 0) {
      // Puntero fuera del tablero o en la cabecera: sin colisión para retorno a origen
      return [];
    }

    const columnaId = String(colisionesColumna[0]!.id);

    // 2. Fase 2: Acotar exclusivamente a los sortable de esa columna (excluyendo la tarjeta activa)
    const tarjetasDeColumna = droppableContainers.filter(
      (c) =>
        !columnasIds.has(String(c.id)) &&
        c.data?.current?.columnId === columnaId &&
        c.id !== args.active.id,
    );

    const colisionesTarjetas = pointerWithin({
      ...args,
      droppableContainers: tarjetasDeColumna,
    });

    if (colisionesTarjetas.length > 0) {
      const colision = colisionesTarjetas[0]!;
      const rectTarjeta = droppableRects.get(colision.id);

      // Si el puntero incide en la mitad superior -> 'before'.
      // Si incide en la mitad inferior -> 'after'.
      let relativePosition: 'before' | 'after' = 'before';
      if (rectTarjeta) {
        const midY = rectTarjeta.top + rectTarjeta.height / 2;
        relativePosition = pointerCoordinates.y >= midY ? 'after' : 'before';
      }

      const data: DatosColisionTablero = {
        columnId: columnaId,
        relativePosition,
        esTarjeta: true,
      };

      return [
        {
          id: colision.id,
          data: {
            ...colision.data,
            ...data,
          },
        },
      ];
    }

    // 3. Fase 3: Caída a la columna si no está sobre ninguna tarjeta (columna vacía o espacio libre inferior)
    const dataColumna: DatosColisionTablero = {
      columnId: columnaId,
      relativePosition: 'after',
      esTarjeta: false,
    };

    return [
      {
        id: columnaId,
        data: {
          ...colisionesColumna[0]!.data,
          ...dataColumna,
        },
      },
    ];
  };
}

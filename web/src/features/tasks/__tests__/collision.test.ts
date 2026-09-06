import { describe, expect, it } from 'vitest';
import type { CollisionDetection, DroppableContainer } from '@dnd-kit/core';
import { crearDetectorTablero } from '../collision.ts';

type RectMap = Parameters<CollisionDetection>[0]['droppableRects'];

function crearContenedor(
  id: string,
  data: Record<string, unknown> = {},
): DroppableContainer {
  return {
    id,
    key: id,
    data: { current: data },
    disabled: false,
    node: { current: null },
    rect: { current: null },
  };
}

describe('Detector de colisiones compuesto del tablero (SL-20)', () => {
  const COLUMNA_ORIGEN = 'col-todo';
  const COLUMNA_DESTINO = 'col-inprogress';
  const TARJETA_DESTINO = 'task-in-progress-1';
  const TARJETA_ACTIVA = 'task-todo-1';

  const columnasIds = new Set([COLUMNA_ORIGEN, COLUMNA_DESTINO]);
  const detector = crearDetectorTablero(() => columnasIds);

  // Geometría representativa del tablero real en desktop:
  // Columna destino: x=300..572 (ancho 272), y=100..700 (alto 600, centro en 436, 400)
  // Tarjeta destino: x=312..560 (ancho 248), y=150..250 (alto 100, centro en 436, 200)
  const droppableRects: RectMap = new Map([
    [
      COLUMNA_DESTINO,
      {
        top: 100,
        bottom: 700,
        left: 300,
        right: 572,
        width: 272,
        height: 600,
      },
    ],
    [
      TARJETA_DESTINO,
      {
        top: 150,
        bottom: 250,
        left: 312,
        right: 560,
        width: 248,
        height: 100,
      },
    ],
  ]);

  const droppableContainers: DroppableContainer[] = [
    crearContenedor(COLUMNA_DESTINO),
    crearContenedor(TARJETA_DESTINO, { columnId: COLUMNA_DESTINO }),
  ];

  it('1. Al soltar sobre el cuarto superior de la tarjeta destino, resuelve la tarjeta y calcula posición "before"', () => {
    // Cuarto superior de la tarjeta: y = 150 + 25 = 175
    const pointerCoordinates = { x: 436, y: 175 };

    const colisiones = detector({
      active: { id: TARJETA_ACTIVA, data: { current: { columnId: COLUMNA_ORIGEN } }, rect: { current: { initial: null, translated: null } } },
      collisionRect: { top: 150, bottom: 250, left: 312, right: 560, width: 248, height: 100 },
      droppableContainers,
      droppableRects,
      pointerCoordinates,
    });

    expect(colisiones).toHaveLength(1);
    expect(colisiones[0]!.id).toBe(TARJETA_DESTINO);
    expect(colisiones[0]!.data?.relativePosition).toBe('before');
    expect(colisiones[0]!.data?.columnId).toBe(COLUMNA_DESTINO);
    expect(colisiones[0]!.data?.esTarjeta).toBe(true);
  });

  it('2. Al soltar sobre la mitad inferior de la tarjeta destino, resuelve la tarjeta y calcula posición "after"', () => {
    // Mitad inferior de la tarjeta: y = 150 + 75 = 225 (centro en 200)
    const pointerCoordinates = { x: 436, y: 225 };

    const colisiones = detector({
      active: { id: TARJETA_ACTIVA, data: { current: { columnId: COLUMNA_ORIGEN } }, rect: { current: { initial: null, translated: null } } },
      collisionRect: { top: 150, bottom: 250, left: 312, right: 560, width: 248, height: 100 },
      droppableContainers,
      droppableRects,
      pointerCoordinates,
    });

    expect(colisiones).toHaveLength(1);
    expect(colisiones[0]!.id).toBe(TARJETA_DESTINO);
    expect(colisiones[0]!.data?.relativePosition).toBe('after');
    expect(colisiones[0]!.data?.columnId).toBe(COLUMNA_DESTINO);
    expect(colisiones[0]!.data?.esTarjeta).toBe(true);
  });

  it('3. Al soltar en el hueco vacío debajo de la tarjeta, cae al contenedor de la columna', () => {
    // Espacio libre debajo de la tarjeta pero dentro de la columna: y = 450
    const pointerCoordinates = { x: 436, y: 450 };

    const colisiones = detector({
      active: { id: TARJETA_ACTIVA, data: { current: { columnId: COLUMNA_ORIGEN } }, rect: { current: { initial: null, translated: null } } },
      collisionRect: { top: 400, bottom: 500, left: 312, right: 560, width: 248, height: 100 },
      droppableContainers,
      droppableRects,
      pointerCoordinates,
    });

    expect(colisiones).toHaveLength(1);
    expect(colisiones[0]!.id).toBe(COLUMNA_DESTINO);
    expect(colisiones[0]!.data?.relativePosition).toBe('after');
    expect(colisiones[0]!.data?.columnId).toBe(COLUMNA_DESTINO);
    expect(colisiones[0]!.data?.esTarjeta).toBe(false);
  });

  it('4. Si el puntero está fuera de todas las columnas (cabecera), devuelve un conjunto vacío', () => {
    // En la cabecera: y = 40 (por encima del top=100 de las columnas)
    const pointerCoordinates = { x: 436, y: 40 };

    const colisiones = detector({
      active: { id: TARJETA_ACTIVA, data: { current: { columnId: COLUMNA_ORIGEN } }, rect: { current: { initial: null, translated: null } } },
      collisionRect: { top: 20, bottom: 60, left: 312, right: 560, width: 248, height: 40 },
      droppableContainers,
      droppableRects,
      pointerCoordinates,
    });

    expect(colisiones).toEqual([]);
  });

  it('5. En una columna vacía, cae directamente al contenedor de la columna', () => {
    const COLUMNA_VACIA = 'col-done';
    const columnasConVacia = new Set([COLUMNA_ORIGEN, COLUMNA_DESTINO, COLUMNA_VACIA]);
    const detectorConVacia = crearDetectorTablero(() => columnasConVacia);

    const rectsConVacia: RectMap = new Map([
      ...droppableRects,
      [
        COLUMNA_VACIA,
        { top: 100, bottom: 700, left: 600, right: 872, width: 272, height: 600 },
      ],
    ]);

    const contenedoresConVacia: DroppableContainer[] = [
      ...droppableContainers,
      crearContenedor(COLUMNA_VACIA),
    ];

    const pointerCoordinates = { x: 700, y: 300 };

    const colisiones = detectorConVacia({
      active: { id: TARJETA_ACTIVA, data: { current: { columnId: COLUMNA_ORIGEN } }, rect: { current: { initial: null, translated: null } } },
      collisionRect: { top: 250, bottom: 350, left: 650, right: 750, width: 100, height: 100 },
      droppableContainers: contenedoresConVacia,
      droppableRects: rectsConVacia,
      pointerCoordinates,
    });

    expect(colisiones).toHaveLength(1);
    expect(colisiones[0]!.id).toBe(COLUMNA_VACIA);
    expect(colisiones[0]!.data?.esTarjeta).toBe(false);
  });
});

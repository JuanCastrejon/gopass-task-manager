import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DragEndEvent, DragMoveEvent } from '@dnd-kit/core';
import type { ProjectColumnSummary, Task } from '../../../types/api.ts';
import { api } from '../../../lib/api-client.ts';

/**
 * Pruebas de reordenación y restricciones de arrastre en el tablero (SL-15 y SL-20).
 *
 * Se simula el cliente HTTP `api` para validar que el componente despacha
 * exactamente los contratos acordados (`previousTaskId`, `nextTaskId`) y que
 * respeta las restricciones de diseño: no reordenar en columnas automáticas,
 * respetar límites WIP en cliente y posicionar según la mitad superior/inferior.
 */

let capturadorDragEnd: ((event: DragEndEvent) => void) | undefined;
let capturadorDragMove: ((event: DragMoveEvent) => void) | undefined;

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  return {
    ...actual,
    DndContext: (props: {
      onDragEnd?: (event: DragEndEvent) => void;
      onDragMove?: (event: DragMoveEvent) => void;
      children: React.ReactNode;
    }) => {
      capturadorDragEnd = props.onDragEnd;
      capturadorDragMove = props.onDragMove;
      return <div data-testid="dnd-context">{props.children}</div>;
    },
  };
});

vi.mock('../../../lib/api-client.ts', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const COLUMNAS: ProjectColumnSummary[] = [
  {
    id: 'col-todo',
    projectId: 'proj-1',
    name: 'Por hacer',
    category: 'TODO',
    position: 1024,
    wipLimit: null,
    sort: 'priority_desc',
    taskCount: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'col-inprogress',
    projectId: 'proj-1',
    name: 'En progreso',
    category: 'IN_PROGRESS',
    position: 2048,
    wipLimit: null,
    sort: 'manual',
    taskCount: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const TAREAS: Task[] = [
  {
    id: 'task-todo-1',
    projectId: 'proj-1',
    columnId: 'col-todo',
    title: 'Tarea Automática 1',
    description: null,
    status: 'TODO',
    priority: 'HIGH',
    position: 1024,
    dueDate: null,
    completedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'task-todo-2',
    projectId: 'proj-1',
    columnId: 'col-todo',
    title: 'Tarea Automática 2',
    description: null,
    status: 'TODO',
    priority: 'LOW',
    position: 2048,
    dueDate: null,
    completedAt: null,
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  },
  {
    id: 'task-manual-1',
    projectId: 'proj-1',
    columnId: 'col-inprogress',
    title: 'Tarea Manual 1',
    description: null,
    status: 'IN_PROGRESS',
    priority: 'MEDIUM',
    position: 1024,
    dueDate: null,
    completedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'task-manual-2',
    projectId: 'proj-1',
    columnId: 'col-inprogress',
    title: 'Tarea Manual 2',
    description: null,
    status: 'IN_PROGRESS',
    priority: 'MEDIUM',
    position: 2048,
    dueDate: null,
    completedAt: null,
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  },
  {
    id: 'task-manual-3',
    projectId: 'proj-1',
    columnId: 'col-inprogress',
    title: 'Tarea Manual 3',
    description: null,
    status: 'IN_PROGRESS',
    priority: 'MEDIUM',
    position: 3072,
    dueDate: null,
    completedAt: null,
    createdAt: '2026-01-03T00:00:00.000Z',
    updatedAt: '2026-01-03T00:00:00.000Z',
  },
];

const { TaskBoard } = await import('../TaskBoard.tsx');

function pintar(columnas = COLUMNAS, tareas = TAREAS) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path.includes('/tasks')) {
      return tareas;
    }
    return [];
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TaskBoard projectId="proj-1" columnas={columnas} />
    </QueryClientProvider>,
  );
}

function simularMover(
  activeId: string,
  overId: string,
  colisionData?: { relativePosition: 'before' | 'after'; columnId?: string; esTarjeta?: boolean },
) {
  act(() => {
    capturadorDragMove?.({
      active: { id: activeId } as DragMoveEvent['active'],
      over: { id: overId } as DragMoveEvent['over'],
      activatorEvent: new MouseEvent('mousemove'),
      collisions: colisionData
        ? [{ id: overId, data: colisionData }]
        : [{ id: overId }],
      delta: { x: 0, y: 0 },
    });
  });
}

function simularSoltar(
  activeId: string,
  overId: string,
  colisionData?: { relativePosition: 'before' | 'after'; columnId?: string; esTarjeta?: boolean },
) {
  act(() => {
    capturadorDragEnd?.({
      active: { id: activeId } as DragEndEvent['active'],
      over: { id: overId } as DragEndEvent['over'],
      activatorEvent: new MouseEvent('mouseup'),
      collisions: colisionData
        ? [{ id: overId, data: colisionData }]
        : null,
      delta: { x: 0, y: 0 },
    });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  capturadorDragEnd = undefined;
  capturadorDragMove = undefined;
  window.history.replaceState(null, '', '/');
});

describe('TaskBoard — Reordenación y restricciones de arrastre (SL-15)', () => {
  it('1. En una columna con sort = "manual", soltar una tarjeta llama al endpoint de reordenación con los vecinos correctos', async () => {
    pintar();

    // Esperar a que las tareas se hayan renderizado
    await screen.findByText('Tarea Manual 1');

    vi.mocked(api.patch).mockResolvedValueOnce({
      ...TAREAS[2]!,
      position: 3500,
    });

    // Mover task-manual-1 (al inicio) a la posición de task-manual-3 (al final):
    // El orden resultante esperado es [task-manual-2, task-manual-3, task-manual-1].
    // Los vecinos de task-manual-1 pasan a ser: previousTaskId = task-manual-3, nextTaskId = null.
    simularSoltar('task-manual-1', 'task-manual-3');

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledTimes(1);
      expect(api.patch).toHaveBeenCalledWith('/tasks/task-manual-1/reorder', {
        columnId: 'col-inprogress',
        previousTaskId: 'task-manual-3',
        nextTaskId: null,
      });
    });

    // Caso inverso: mover task-manual-3 a la posición de task-manual-2 (punto medio):
    // La lista actual de la columna es [1, 2, 3]. Mover 3 a la posición de 2 resulta en [1, 3, 2].
    // Los vecinos de task-manual-3 deben ser previousTaskId = task-manual-1, nextTaskId = task-manual-2.
    vi.mocked(api.patch).mockClear();
    vi.mocked(api.patch).mockResolvedValueOnce({
      ...TAREAS[4]!,
      position: 1536,
    });

    simularSoltar('task-manual-3', 'task-manual-2');

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledTimes(1);
      expect(api.patch).toHaveBeenCalledWith('/tasks/task-manual-3/reorder', {
        columnId: 'col-inprogress',
        previousTaskId: 'task-manual-1',
        nextTaskId: 'task-manual-2',
      });
    });
  });

  it('2. En una columna con sort = "priority_desc", el reordenado vertical no dispara ninguna llamada, y el motivo se muestra al usuario', async () => {
    pintar();

    // Esperar renderizado
    await screen.findByText('Tarea Automática 1');

    // Comprobar que el motivo por el cual el reordenado no está disponible es visible en la columna
    expect(
      screen.getByText('Ordenada por prioridad — cambia el orden a manual para reordenar'),
    ).toBeTruthy();

    // Intentar arrastrar verticalmente task-todo-1 sobre task-todo-2 dentro de la misma columna
    simularSoltar('task-todo-1', 'task-todo-2');

    // Esperar un ciclo para garantizar que no se dispara ninguna llamada asíncrona
    await new Promise((r) => setTimeout(r, 50));

    // No debe dispararse ninguna llamada al endpoint de reordenación ni de actualización
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('3. Mover entre columnas sigue funcionando en una columna con orden automático', async () => {
    const user = userEvent.setup();
    pintar();

    // Esperar renderizado
    await screen.findByText('Tarea Automática 1');

    vi.mocked(api.patch).mockResolvedValue({
      ...TAREAS[0]!,
      columnId: 'col-inprogress',
    });

    // 3a. Mover mediante la flecha de accesibilidad (WCAG 2.2 SC 2.5.7) desde la columna automática
    const botonMover = screen.getByRole('button', {
      name: 'Mover "Tarea Automática 1" a En progreso',
    });
    await user.click(botonMover);

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/tasks/task-todo-1', {
        columnId: 'col-inprogress',
      });
    });

    // 3b. Mover mediante arrastre desde la columna automática hacia la columna manual
    vi.mocked(api.patch).mockClear();

    simularSoltar('task-todo-2', 'col-inprogress');

    // Mover hacia una columna manual al área de la columna la ubica al final
    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledTimes(1);
      expect(api.patch).toHaveBeenCalledWith('/tasks/task-todo-2/reorder', {
        columnId: 'col-inprogress',
        previousTaskId: 'task-manual-3',
        nextTaskId: null,
      });
    });
  });

  it('4. las columnas adoptan ancho fijo de 272 px con shrink-0 en desktop (lg) y no se estiran con 1fr', async () => {
    pintar();

    await screen.findByText('Tarea Manual 1');

    // Comprobación sobre clases en JSDOM: JSDOM no dispone de motor de maquetación CSS
    // por lo que las dimensiones computadas son 0; las utilidades semánticas de Tailwind
    // representan el contrato fidedigno de geometría sin suposiciones artificiales.
    const tablero = screen.getByRole('region', { name: 'Tablero de tareas' });
    expect(tablero.className).toContain('lg:flex');
    expect(tablero.className).toContain('lg:overflow-x-auto');
    expect(tablero.className).toContain('lg:gap-3');
    expect(tablero.className).not.toContain('lg:auto-cols');
    expect(tablero.className).not.toContain('minmax');

    const columnaPorHacer = screen.getByRole('region', { name: 'Por hacer' });
    expect(columnaPorHacer.className).toContain('lg:w-[272px]');
    expect(columnaPorHacer.className).toContain('lg:shrink-0');
    expect(columnaPorHacer.className).not.toContain('lg:w-auto');
    expect(columnaPorHacer.className).not.toContain('flex-1');

    const columnaEnProgreso = screen.getByRole('region', { name: 'En progreso' });
    expect(columnaEnProgreso.className).toContain('lg:w-[272px]');
    expect(columnaEnProgreso.className).toContain('lg:shrink-0');
  });

  it('5. Soltar sobre la mitad inferior de una tarjeta en otra columna manual la posiciona después de ella (SL-20)', async () => {
    pintar();

    await screen.findByText('Tarea Manual 1');

    vi.mocked(api.patch).mockResolvedValueOnce({
      ...TAREAS[0]!,
      columnId: 'col-inprogress',
      position: 1536,
    });

    // Mover task-todo-1 hacia la columna manual 'col-inprogress', soltando sobre la mitad inferior
    // de la primera tarjeta (task-manual-1).
    // Con relativePosition: 'after', se inserta después de task-manual-1.
    // Vecinas esperadas: previousTaskId = task-manual-1, nextTaskId = task-manual-2.
    simularSoltar('task-todo-1', 'task-manual-1', {
      relativePosition: 'after',
      columnId: 'col-inprogress',
      esTarjeta: true,
    });

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledTimes(1);
      expect(api.patch).toHaveBeenCalledWith('/tasks/task-todo-1/reorder', {
        columnId: 'col-inprogress',
        previousTaskId: 'task-manual-1',
        nextTaskId: 'task-manual-2',
      });
    });
  });

  it('6. Soltar sobre el cuarto superior de la primera tarjeta en otra columna manual la posiciona la primera (SL-20)', async () => {
    pintar();

    await screen.findByText('Tarea Manual 1');

    vi.mocked(api.patch).mockResolvedValueOnce({
      ...TAREAS[0]!,
      columnId: 'col-inprogress',
      position: 512,
    });

    // Mover task-todo-1 hacia 'col-inprogress', soltando sobre el cuarto superior (before)
    // de la primera tarjeta (task-manual-1).
    // Vecinas esperadas: previousTaskId = null, nextTaskId = task-manual-1 -> servidor calcula 512.
    simularSoltar('task-todo-1', 'task-manual-1', {
      relativePosition: 'before',
      columnId: 'col-inprogress',
      esTarjeta: true,
    });

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledTimes(1);
      expect(api.patch).toHaveBeenCalledWith('/tasks/task-todo-1/reorder', {
        columnId: 'col-inprogress',
        previousTaskId: null,
        nextTaskId: 'task-manual-1',
      });
    });
  });

  it('7. En una columna con límite WIP lleno, soltar una tarjeta proveniente de otra columna no emite peticiones y muestra alerta accesible (SL-20)', async () => {
    // Definir columna con límite WIP de 3 tareas (ya lleno porque hay 3 tareas manuales)
    const columnasConWip: ProjectColumnSummary[] = [
      COLUMNAS[0]!,
      {
        ...COLUMNAS[1]!,
        wipLimit: 3,
        taskCount: 3,
      },
    ];

    pintar(columnasConWip);

    await screen.findByText('Tarea Manual 1');

    // Intentar soltar task-todo-1 (proveniente de col-todo) sobre col-inprogress (que ya tiene 3 tareas)
    simularSoltar('task-todo-1', 'col-inprogress', {
      relativePosition: 'after',
      columnId: 'col-inprogress',
      esTarjeta: false,
    });

    // Esperar un ciclo para confirmar que no se emite ninguna llamada HTTP
    await new Promise((r) => setTimeout(r, 50));

    expect(api.patch).not.toHaveBeenCalled();

    // Se debe mostrar un mensaje accesible con role="alert"
    const alerta = screen.getByRole('alert');
    expect(alerta).toBeTruthy();
    expect(alerta.textContent).toContain('ha alcanzado su límite de trabajo en curso (3)');
  });

  it('8. El indicador visual de inserción se renderiza solo en columnas manuales y nunca en automáticas (SL-20)', async () => {
    pintar();

    await screen.findByText('Tarea Manual 1');

    // No debe haber ningún indicador de inserción inicialmente
    expect(screen.queryByTestId('indicador-insercion')).toBeNull();

    // Simular arrastre sobre una tarjeta en columna manual (col-inprogress)
    simularMover('task-todo-1', 'task-manual-1', {
      relativePosition: 'before',
      columnId: 'col-inprogress',
      esTarjeta: true,
    });

    // En columna manual, el indicador de inserción debe ser visible
    expect(screen.getByTestId('indicador-insercion')).toBeTruthy();

    // Simular arrastre sobre una columna automática (col-todo)
    simularMover('task-manual-1', 'task-todo-1', {
      relativePosition: 'before',
      columnId: 'col-todo',
      esTarjeta: true,
    });

    // En columna automática, el indicador de inserción NO debe renderizarse nunca
    expect(screen.queryByTestId('indicador-insercion')).toBeNull();
  });
});

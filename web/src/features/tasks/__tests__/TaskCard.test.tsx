import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TaskCard } from '../TaskCard.tsx';
import type { ProjectColumnSummary, Task } from '../../../types/api.ts';

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    setNodeRef: vi.fn(),
    listeners: {},
    isDragging: false,
    transform: null,
    transition: undefined,
  }),
}));

const COL_ANTERIOR: ProjectColumnSummary = {
  id: 'col-1',
  projectId: 'p-1',
  name: 'Por hacer',
  category: 'TODO',
  position: 1024,
  wipLimit: null,
  sort: 'manual',
  taskCount: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const COL_SIGUIENTE: ProjectColumnSummary = {
  id: 'col-3',
  projectId: 'p-1',
  name: 'Completada',
  category: 'DONE',
  position: 3072,
  wipLimit: null,
  sort: 'manual',
  taskCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const TAREA: Task = {
  id: 'task-1',
  projectId: 'p-1',
  columnId: 'col-2',
  title: 'Diseñar arquitectura',
  description: 'Detalles técnicos',
  status: 'IN_PROGRESS',
  priority: 'HIGH',
  position: 1024,
  dueDate: '2026-09-10',
  completedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('TaskCard — Densidad, geometría de Trello y objetivos táctiles', () => {
  it('aplica densidad compacta, radio de 8px y sombra Trello en puntero fino', () => {
    render(
      <TaskCard
        task={TAREA}
        pending={false}
        autoFocus={false}
        anterior={COL_ANTERIOR}
        siguiente={COL_SIGUIENTE}
        onMove={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const tarjeta = screen.getByRole('article');
    expect(tarjeta.className).toContain('rounded-lg');
    expect(tarjeta.className).toContain('p-2.5');
    expect(tarjeta.className).toContain('shadow-card');
    expect(tarjeta.className).toContain('hover:shadow-card-hover');
    expect(tarjeta.className).toContain('pointer-coarse:p-3');
  });

  it('en puntero grueso todos los controles conservan el objetivo táctil de 44 px (pointer-coarse:size-11)', () => {
    render(
      <TaskCard
        task={TAREA}
        pending={false}
        autoFocus={false}
        anterior={COL_ANTERIOR}
        siguiente={COL_SIGUIENTE}
        onMove={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const botonCompletar = screen.getByLabelText(/Completar "Diseñar arquitectura"/);
    expect(botonCompletar.className).toContain('pointer-coarse:size-11');

    const botonEditar = screen.getByRole('button', { name: 'Editar Diseñar arquitectura' });
    expect(botonEditar.className).toContain('pointer-coarse:size-11');

    const botonEliminar = screen.getByRole('button', { name: 'Eliminar Diseñar arquitectura' });
    expect(botonEliminar.className).toContain('pointer-coarse:size-11');

    const botonMoverAnterior = screen.getByRole('button', {
      name: 'Mover "Diseñar arquitectura" a Por hacer',
    });
    expect(botonMoverAnterior.className).toContain('pointer-coarse:size-11');

    const botonMoverSiguiente = screen.getByRole('button', {
      name: 'Mover "Diseñar arquitectura" a Completada',
    });
    expect(botonMoverSiguiente.className).toContain('pointer-coarse:size-11');
  });
});

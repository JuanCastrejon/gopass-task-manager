import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LabelBadge, LabelPills } from '../../../components/ui/Badge.tsx';
import type { Label } from '../../../types/api.ts';

describe('LabelBadge y LabelPills (SL-18)', () => {
  it('renderiza la píldora con color semántico, clases de truncamiento y title completo', () => {
    const label: Label = {
      id: 'lbl-1',
      projectId: 'p-1',
      name: 'Nombre Extremadamente Largo Que Debe Truncarse Con Elipsis',
      color: 'red',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    render(<LabelBadge label={label} />);

    const badge = screen.getByTestId('label-badge');
    expect(badge).toBeTruthy();
    expect(badge.className).toContain('bg-label-red-soft');
    expect(badge.className).toContain('text-label-red');
    expect(badge.className).toContain('truncate');
    expect(badge.getAttribute('title')).toBe(label.name);
    expect(badge.textContent).toBe(label.name);
  });

  it('renderiza hasta 2 píldoras visibles directamente sin insignia +N', () => {
    const labels: Label[] = [
      {
        id: 'lbl-1',
        projectId: 'p-1',
        name: 'Backend',
        color: 'indigo',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'lbl-2',
        projectId: 'p-1',
        name: 'Urgente',
        color: 'red',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    render(<LabelPills labels={labels} />);

    const badges = screen.getAllByTestId('label-badge');
    expect(badges).toHaveLength(2);
    expect(screen.queryByTestId('label-more-badge')).toBeNull();
  });

  it('muestra la insignia +N accesible cuando hay más de 2 etiquetas con los nombres restantes', () => {
    const labels: Label[] = [
      {
        id: 'lbl-1',
        projectId: 'p-1',
        name: 'Backend',
        color: 'indigo',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'lbl-2',
        projectId: 'p-1',
        name: 'Urgente',
        color: 'red',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'lbl-3',
        projectId: 'p-1',
        name: 'Seguridad',
        color: 'amber',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'lbl-4',
        projectId: 'p-1',
        name: 'Infraestructura',
        color: 'teal',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    render(<LabelPills labels={labels} />);

    const visibles = screen.getAllByTestId('label-badge');
    expect(visibles).toHaveLength(2);
    expect(visibles.map((v) => v.textContent)).toEqual(['Backend', 'Urgente']);

    const moreBadge = screen.getByTestId('label-more-badge');
    expect(moreBadge).toBeTruthy();
    expect(moreBadge.textContent).toBe('+2');
    expect(moreBadge.getAttribute('aria-label')).toBe('Seguridad, Infraestructura');
    expect(moreBadge.getAttribute('title')).toBe('Seguridad, Infraestructura');
  });
});

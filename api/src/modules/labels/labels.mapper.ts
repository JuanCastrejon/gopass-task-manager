import type { LabelColor } from './labels.schema.js';

export interface LabelRow {
  id: string;
  project_id: string;
  name: string;
  color: LabelColor;
  created_at: Date;
  updated_at: Date;
}

export interface Label {
  id: string;
  projectId: string;
  name: string;
  color: LabelColor;
  createdAt: string;
  updatedAt: string;
}

export function toLabel(row: LabelRow): Label {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    color: row.color,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

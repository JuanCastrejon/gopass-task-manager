/**
 * Contratos que el frontend consume de la API.
 *
 * Escritos a mano y no generados: son cinco formas y generarlas exigiría una
 * herramienta más en el proyecto. Están junto al cliente HTTP y su fuente de
 * verdad es `docs/spec/03-contrato-api.md`; las pruebas de integración del
 * backend son las que garantizan que la API responde así.
 */

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export const TASK_STATUSES: readonly TaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE'];
export const TASK_PRIORITIES: readonly TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH'];

/**
 * 12 fichas de color semánticas para etiquetas por proyecto (SL-18).
 * Paleta fija y deliberada con contraste AA verificado (>= 4.5:1).
 */
export const LABEL_COLORS = [
  'slate',
  'red',
  'orange',
  'amber',
  'yellow',
  'green',
  'teal',
  'cyan',
  'blue',
  'indigo',
  'purple',
  'pink',
] as const;

export type LabelColor = (typeof LABEL_COLORS)[number];

export const LABEL_COLOR_NAMES: Record<LabelColor, string> = {
  slate: 'Pizarra',
  red: 'Rojo',
  orange: 'Naranja',
  amber: 'Ámbar',
  yellow: 'Amarillo',
  green: 'Verde',
  teal: 'Turquesa',
  cyan: 'Cian',
  blue: 'Azul',
  indigo: 'Índigo',
  purple: 'Púrpura',
  pink: 'Rosa',
};

export interface Label {
  id: string;
  projectId: string;
  name: string;
  color: LabelColor;
  taskCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLabelInput {
  name: string;
  color: LabelColor;
}

export interface PatchLabelInput {
  name?: string;
  color?: LabelColor;
}

export interface SetTaskLabelsInput {
  labelIds: string[];
}

/**
 * Criterios de orden de una columna. El orden es configuración del tablero y
 * no preferencia de cada navegador: se guarda en la columna, así que todo el
 * equipo ve lo mismo y sobrevive a cambiar de equipo.
 */
export const COLUMN_SORTS = [
  'manual',
  'priority_desc',
  'priority_asc',
  'created_desc',
  'created_asc',
  'due_asc',
] as const;
export type ColumnSort = (typeof COLUMN_SORTS)[number];

export const COLUMN_SORT_LABEL: Record<ColumnSort, string> = {
  manual: 'Manual',
  priority_desc: 'Prioridad alta primero',
  priority_asc: 'Prioridad baja primero',
  created_desc: 'Más recientes primero',
  created_asc: 'Más antiguas primero',
  due_asc: 'Lo que vence antes',
};

/**
 * Una columna del tablero.
 *
 * `category` es la categoría de ciclo de vida, y varias columnas pueden
 * compartirla: «En revisión» y «QA» son ambas `IN_PROGRESS`. Es lo que permite
 * que el panel agregado siga informando entre proyectos con tableros
 * distintos, y de lo que dependen las garantías que el motor impone sobre
 * `completedAt`. Es el mismo modelo de categorías de estado de Jira.
 */
export interface ProjectColumn {
  id: string;
  projectId: string;
  name: string;
  category: TaskStatus;
  position: number;
  /** Máximo de tareas simultáneas. `null` es «sin límite». Nunca en una terminal. */
  wipLimit: number | null;
  sort: ColumnSort;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectColumnSummary extends ProjectColumn {
  taskCount: number;
}

export interface CreateColumnInput {
  name: string;
  category: TaskStatus;
  wipLimit?: number | null;
  sort?: ColumnSort;
}

export interface PatchColumnInput {
  name?: string;
  wipLimit?: number | null;
  sort?: ColumnSort;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSummary extends Project {
  taskCount: number;
  doneCount: number;
  /**
   * Cuántas tareas de cada prioridad tiene el proyecto. Las tres claves llegan
   * siempre, también en 0, así que el filtro del panel puede preguntar
   * `byPriority[p] > 0` sin defenderse de una clave ausente.
   */
  byPriority: Record<TaskPriority, number>;
  progress: number;
}

export interface Task {
  id: string;
  projectId: string;
  /** Columna del tablero en la que vive. Su categoría es siempre `status`. */
  columnId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  /** Posición fraccionaria calculada por el servidor para el orden manual en la columna. */
  position: number;
  /** Fecha de vencimiento (YYYY-MM-DD) o null si no tiene. */
  dueDate: string | null;
  /** Lo sella la base en la transición a DONE. La API rechaza escribirlo. */
  completedAt: string | null;
  /** Etiquetas asignadas a la tarea (SL-18). */
  labels?: Label[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string | null;
}

export interface PatchProjectInput {
  name?: string;
  description?: string | null;
}

export interface Stats {
  projects: number;
  tasks: number;
  done: number;
  progress: number;
  byStatus: Record<TaskStatus, number>;
  byPriority: Record<TaskPriority, number>;
}

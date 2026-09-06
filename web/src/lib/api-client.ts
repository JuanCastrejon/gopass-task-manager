/**
 * Cliente HTTP tipado.
 *
 * Toda la aplicación pide a `/api`, una ruta relativa: en desarrollo la
 * reenvía el proxy de Vite y en Docker lo hace nginx. No hay URL de backend
 * dentro del bundle ni configuración de CORS por ambiente.
 */

/** Respuesta de error de la API, en formato RFC 7807. */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  instance?: string;
  errors?: Array<{ path: string; message: string }>;
}

/**
 * El `code` es el contrato estable con el servidor. La interfaz decide
 * qué mensaje mostrar a partir de él, nunca comparando contra `title`.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly problem: ProblemDetails | null;

  constructor(status: number, problem: ProblemDetails | null, fallback: string) {
    super(problem?.detail ?? problem?.title ?? fallback);
    this.name = 'ApiError';
    this.status = status;
    this.code = problem?.code ?? 'UNKNOWN';
    this.problem = problem;
  }
}

function isProblem(value: unknown): value is ProblemDetails {
  return typeof value === 'object' && value !== null && typeof (value as ProblemDetails).code === 'string';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    // Fallo de red o servidor caído: no hay `Problem Details` que leer.
    throw new ApiError(0, null, 'No se pudo contactar con el servidor.');
  }

  if (response.status === 204) return undefined as T;

  const raw = await response.text();

  // No toda respuesta de error es JSON. Un proxy caído devuelve el HTML de un
  // 502, y un `JSON.parse` sin protección lanzaría un `SyntaxError` que no es
  // un `ApiError`: la interfaz mostraría "algo no salió como esperábamos" en
  // lugar de decir que no hay servidor.
  let body: unknown = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }

  if (!response.ok) {
    const problem = isProblem(body) ? body : null;
    throw new ApiError(response.status, problem, 'Error inesperado.');
  }

  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path: string) => request<void>(path, { method: 'DELETE' }),
};

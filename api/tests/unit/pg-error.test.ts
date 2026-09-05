import { describe, expect, it } from 'vitest';
import {
  isPgError,
  isTaskProjectFkViolation,
  translatePgError,
  type PgError,
} from '../../src/db/pg-error.js';
import { ERROR_CODES } from '../../src/http/errors.js';

/**
 * Los errores de esta prueba están copiados de una ejecución real contra
 * PostgreSQL 16.15: mismos `code`, `constraint`, `table` y `detail`. No se
 * inventan formas de error.
 *
 * La cobertura real de este módulo la dan las pruebas de integración, que
 * provocan cada violación de verdad contra el motor. Estas unitarias
 * documentan la decisión de diseño: por qué `23503` NO se traduce aquí.
 */
function pgError(fields: Partial<PgError> & { code: string }): PgError {
  return Object.assign(new Error('error de postgres'), fields) as PgError;
}

describe('isPgError', () => {
  it('reconoce un error del driver por su campo code', () => {
    expect(isPgError(pgError({ code: '23505' }))).toBe(true);
  });

  it('no confunde un Error corriente con uno del driver', () => {
    expect(isPgError(new Error('boom'))).toBe(false);
    expect(isPgError({ code: '23505' })).toBe(false);
    expect(isPgError(null)).toBe(false);
  });
});

describe('23503 — la ambigüedad que no se resuelve aquí', () => {
  // Ambos objetos son los que devolvió PostgreSQL 16.15 de verdad.
  const borrarPadreConHijos = pgError({
    code: '23503',
    constraint: 'tasks_project_id_fkey',
    table: 'tasks',
    detail: 'Key (id)=(05f47239) is still referenced from table "tasks".',
  });

  const insertarHijoSinPadre = pgError({
    code: '23503',
    constraint: 'tasks_project_id_fkey',
    table: 'tasks',
    detail: 'Key (project_id)=(00000000) is not present in table "projects".',
  });

  it('los dos casos son indistinguibles por code, constraint y table', () => {
    expect(borrarPadreConHijos.code).toBe(insertarHijoSinPadre.code);
    expect(borrarPadreConHijos.constraint).toBe(insertarHijoSinPadre.constraint);
    expect(borrarPadreConHijos.table).toBe(insertarHijoSinPadre.table);
  });

  it('por eso translatePgError devuelve null: no puede decidir 409 o 404', () => {
    expect(translatePgError(borrarPadreConHijos)).toBeNull();
    expect(translatePgError(insertarHijoSinPadre)).toBeNull();
  });

  it('pero sí reconoce que la violación es de la FK de tareas', () => {
    expect(isTaskProjectFkViolation(borrarPadreConHijos)).toBe(true);
    expect(isTaskProjectFkViolation(insertarHijoSinPadre)).toBe(true);
    expect(isTaskProjectFkViolation(pgError({ code: '23503', constraint: 'otra_fkey' }))).toBe(false);
  });
});

describe('los códigos que sí se traducen sin contexto', () => {
  it('23505 sobre el índice único de nombre → 409 PROJECT_NAME_TAKEN', () => {
    const err = translatePgError(pgError({
      code: '23505',
      constraint: 'projects_name_unique_ci',
      table: 'projects',
    }));
    expect(err?.status).toBe(409);
    expect(err?.code).toBe(ERROR_CODES.PROJECT_NAME_TAKEN);
  });

  it('23505 sobre otro índice no se adivina', () => {
    expect(translatePgError(pgError({ code: '23505', constraint: 'otro_idx' }))).toBeNull();
  });

  it('23514 → 400 con el campo señalado a partir del nombre del CHECK', () => {
    const err = translatePgError(pgError({
      code: '23514',
      constraint: 'tasks_title_not_blank',
      table: 'tasks',
    }));
    expect(err?.status).toBe(400);
    expect(err?.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    expect(err?.issues?.[0]?.path).toBe('title');
  });

  it('22P02 (uuid mal formado o valor fuera del enum) → 400', () => {
    const err = translatePgError(pgError({ code: '22P02' }));
    expect(err?.status).toBe(400);
    expect(err?.code).toBe(ERROR_CODES.VALIDATION_ERROR);
  });

  it('23502 (NOT NULL) → 400', () => {
    expect(translatePgError(pgError({ code: '23502' }))?.status).toBe(400);
  });

  it('un código desconocido no se inventa una traducción', () => {
    expect(translatePgError(pgError({ code: '42883' }))).toBeNull();
    expect(translatePgError(new Error('no es de postgres'))).toBeNull();
  });
});

describe('el error traducido nunca lleva encima lo que dijo PostgreSQL', () => {
  it('no copia detail ni constraint al mensaje visible', () => {
    const err = translatePgError(pgError({
      code: '23514',
      constraint: 'projects_name_not_blank',
      detail: 'Failing row contains (fc3b01d6-77b5-4403-aaeb-bda7ba7e7d58,    ).',
    }));
    const serializado = JSON.stringify({ message: err?.message, issues: err?.issues });
    expect(serializado).not.toContain('Failing row');
    expect(serializado).not.toContain('fc3b01d6');
    expect(serializado).not.toContain('projects_name_not_blank');
  });
});

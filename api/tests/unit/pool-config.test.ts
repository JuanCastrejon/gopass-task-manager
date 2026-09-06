import { describe, expect, it } from 'vitest';
import { resolvePoolConfig } from '../../src/db/pool.js';

describe('resolvePoolConfig — resolución de TLS y compatibilidad con entornos', () => {
  it('no activa SSL cuando NODE_ENV es production si la base es local (docker-compose / contenedor db)', () => {
    const localUrl = 'postgresql://gopass:gopass@db:5432/gopass_tasks';
    const config = resolvePoolConfig(localUrl, undefined);

    expect(config.ssl).toBeUndefined();
    expect(config.connectionString).toBe(localUrl);
  });

  it('no activa SSL para conexiones locales a localhost aunque se llame en entorno de producción', () => {
    const localUrl = 'postgresql://gopass:gopass@localhost:5433/gopass_tasks';
    const config = resolvePoolConfig(localUrl, undefined);

    expect(config.ssl).toBeUndefined();
  });

  it('activa SSL cuando APP_ENV es production (despliegue en Vercel)', () => {
    const cloudUrl = 'postgresql://postgres:secret@db.project.supabase.co:5432/postgres';
    const config = resolvePoolConfig(cloudUrl, 'production');

    expect(config.ssl).toEqual({ rejectUnauthorized: false });
  });

  it('activa SSL automáticamente cuando la URL apunta a supabase.com independientemente de APP_ENV', () => {
    const supabaseUrl = 'postgresql://postgres.dpoysijrptxtpfumawju:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres';
    const config = resolvePoolConfig(supabaseUrl, undefined);

    expect(config.ssl).toEqual({ rejectUnauthorized: false });
  });

  it('normaliza sslmode=require a sslmode=no-verify para evitar errores de cadena de certificados autofirmados', () => {
    const urlConRequire = 'postgresql://user:pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require';
    const config = resolvePoolConfig(urlConRequire, undefined);

    expect(config.ssl).toEqual({ rejectUnauthorized: false });
    expect(config.connectionString).toContain('sslmode=no-verify');
    expect(config.connectionString).not.toContain('sslmode=require');
  });
});

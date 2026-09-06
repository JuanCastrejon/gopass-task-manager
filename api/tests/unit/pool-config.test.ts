import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolvePoolConfig } from '../../src/db/pool.js';

describe('resolvePoolConfig — resolución de TLS y compatibilidad con entornos', () => {
  it('no activa SSL para una base local, sea cual sea el modo de compilación', () => {
    const localUrl = 'postgresql://gopass:gopass@db:5432/gopass_tasks';
    const config = resolvePoolConfig(localUrl, undefined);

    expect(config.ssl).toBeUndefined();
    expect(config.connectionString).toBe(localUrl);
  });

  it('no activa SSL para conexiones locales a localhost', () => {
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

  /**
   * La regresión que originó este archivo, cubierta de verdad.
   *
   * Los casos de arriba **no** pueden atraparla. `env.NODE_ENV` se resuelve en
   * `config/env.ts` al importarse el módulo, y Vitest fija `NODE_ENV=test` en sus
   * workers: dentro de una prueba corriente ese valor nunca es `'production'`, así
   * que reintroducir `env.NODE_ENV === 'production'` en el predicado deja la suite
   * entera en verde. Se comprobó devolviendo el defecto al código: los cinco casos
   * anteriores pasaron sin inmutarse.
   *
   * Para observarlo hay que reevaluar la cadena de imports con el entorno ya
   * cambiado, que es lo que hacen `resetModules` más el import dinámico.
   */
  describe('la regresión de docker compose', () => {
    const nodeEnvOriginal = process.env['NODE_ENV'];

    afterEach(() => {
      process.env['NODE_ENV'] = nodeEnvOriginal;
      vi.resetModules();
    });

    it('con NODE_ENV=production y una base local sigue sin exigir TLS', async () => {
      process.env['NODE_ENV'] = 'production';
      vi.resetModules();

      const recargado = await import('../../src/db/pool.js');
      const config = recargado.resolvePoolConfig(
        'postgresql://gopass:gopass@db:5432/gopass_tasks',
        undefined,
      );

      // `docker-compose.yml` y `api/Dockerfile` declaran NODE_ENV=production y
      // levantan un postgres:16-alpine sin SSL. Si esta expectativa cae, la
      // portada del README vuelve a estar rota.
      expect(config.ssl).toBeUndefined();
    });
  });
});

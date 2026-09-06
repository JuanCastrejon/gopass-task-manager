import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Fija el entorno de cada worker ANTES de que se evalúen los imports del
    // archivo de prueba: `pool.ts` lee `DATABASE_URL` al importarse.
    setupFiles: ['tests/setup/test-db.ts'],
    coverage: {
      provider: 'v8',
      // `json` además del resumen: `sdlc coverage-diff` necesita el formato
      // detallado (`coverage-final.json`) para cruzarlo con el `git diff`.
      reporter: ['text-summary', 'json-summary', 'json', 'lcov'],
      // A la raíz del repositorio: el `emits` del contrato de calidad se
      // resuelve desde ahí, no desde `api/`.
      reportsDirectory: '../coverage',
      // La cobertura se mide sobre código funcional. Incluir el arranque y
      // la configuración solo infla el denominador y convierte la métrica
      // en decorativa.
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/config/**', 'src/db/seed.ts'],
    },
  },
});

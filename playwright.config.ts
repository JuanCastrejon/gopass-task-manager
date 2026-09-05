import { defineConfig, devices } from '@playwright/test';

/**
 * Los E2E viven en la raíz porque ejercitan el sistema entero —navegador,
 * proxy de Vite, Express y PostgreSQL—, no solo `web/`.
 *
 * Solo hay dos escenarios y son los dos que ninguna otra prueba puede cubrir:
 * que el estado sobreviva a una recarga de verdad, y que el 409 llegue a los
 * ojos del usuario. Todo lo demás ya está probado en la capa de integración,
 * que es más rápida y más específica.
 */
export default defineConfig({
  testDir: './e2e',
  // Serie: los dos escenarios escriben en la misma base.
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  timeout: 30_000,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // `npm run dev` levanta api y web a la vez. La base tiene que estar en
    // marcha: `docker compose up -d db`.
    command: 'npm run dev',
    // `localhost` y no `127.0.0.1`: en Windows, Vite se ata a `::1` y una
    // sonda contra la IPv4 nunca responde.
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env['CI'],
    timeout: 90_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});

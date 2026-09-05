/**
 * Capturas del README, reproducibles.
 *
 *   docker compose up --build -d
 *   node scripts/capturas.mjs
 *
 * Se versionan las imágenes, no se rehacen a mano: si la interfaz cambia,
 * este script las vuelve a generar iguales.
 */
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: 1240, height: 900 } });

await pagina.goto(BASE, { waitUntil: 'networkidle' });
await pagina.waitForSelector('text=AVANCE GLOBAL');
await pagina.screenshot({ path: 'docs/assets/panel.png' });
console.log('docs/assets/panel.png');

await pagina.getByRole('link', { name: 'Ver tareas' }).first().click();
await pagina.waitForSelector('[aria-label="Tablero de tareas"]');
await pagina.waitForTimeout(500);
await pagina.screenshot({ path: 'docs/assets/tablero.png' });
console.log('docs/assets/tablero.png');

await navegador.close();

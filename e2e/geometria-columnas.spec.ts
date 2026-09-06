import { expect, test } from './limpieza.js';

/**
 * Escenario de geometría y densidad estilo Trello (SL-19 paso 2).
 *
 * Valida que desde el punto de corte `lg` las columnas adoptan un ancho fijo
 * de 272 px (sin estirarse con 1fr), que con 4 columnas existe desplazamiento
 * horizontal en pantallas de escritorio donde no caben simultáneamente (p. ej. 1024 px),
 * y que todas las columnas continúan siendo plenamente alcanzables e interactivas.
 */
test.use({ viewport: { width: 1024, height: 768 } });

test('con cuatro columnas hay ancho fijo de 272 px, desplazamiento horizontal y todas son alcanzables', async ({
  page,
}) => {

  const sufijo = Date.now().toString(36);
  const proyecto = `E2E Geometria ${sufijo}`;

  await page.goto('/');

  await page.getByRole('button', { name: 'Nuevo proyecto' }).click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel('Nombre').fill(proyecto);
  await dialogo.getByRole('button', { name: 'Crear proyecto' }).click();

  await page
    .locator('article')
    .filter({ hasText: proyecto })
    .getByRole('link', { name: /^Abrir tareas de/ })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: proyecto })).toBeVisible();

  // Se añade una cuarta columna desde la gestión de columnas
  await page.getByRole('button', { name: 'Columnas' }).click();
  const gestor = page.getByRole('dialog');
  await gestor.getByLabel('Nueva columna').fill('En revisión');
  await gestor.getByLabel('Tipo').selectOption('IN_PROGRESS');
  await gestor.getByRole('button', { name: 'Añadir' }).click();
  await gestor.getByLabel('Cerrar').click();

  const tablero = page.getByRole('region', { name: 'Tablero de tareas' });
  await expect(tablero).toBeVisible();

  // Comprobar que en breakpoint lg el ancho geométrico es estrictamente 272 px por columna
  const nombresColumnas = ['Por hacer', 'En curso', 'En revisión', 'Completada'];
  for (const nombre of nombresColumnas) {
    const col = page.getByRole('region', { name: nombre });
    await expect(col).toBeVisible();
    const box = await col.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.round(box!.width)).toBe(272);
  }

  // Comprobar que existe desplazamiento horizontal en el contenedor
  const tieneScrollHorizontal = await tablero.evaluate(
    (el) => el.scrollWidth > el.clientWidth,
  );
  expect(tieneScrollHorizontal).toBe(true);

  // Comprobar que la última columna es alcanzable y permite operar
  const ultimaCol = page.getByRole('region', { name: 'Completada' });
  await ultimaCol.scrollIntoViewIfNeeded();
  await expect(ultimaCol).toBeVisible();
  await expect(ultimaCol.getByRole('button', { name: 'Añadir tarea a Completada' })).toBeVisible();

  // Comprobar que la primera columna sigue siendo alcanzable navegando hacia la izquierda
  const primeraCol = page.getByRole('region', { name: 'Por hacer' });
  await primeraCol.scrollIntoViewIfNeeded();
  await expect(primeraCol).toBeVisible();
  await expect(primeraCol.getByRole('button', { name: 'Añadir tarea a Por hacer' })).toBeVisible();
});

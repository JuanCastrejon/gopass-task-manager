import { expect, test } from '@playwright/test';

/**
 * Los límites y su espacio de configuración (SL-22).
 *
 * Lo que ninguna prueba de integración puede demostrar: que la plantilla
 * elegida al crear llega hasta PostgreSQL a través de la interfaz real, que el
 * número aparece después en la superficie donde se busca, y que editarlo ahí
 * cambia el comportamiento del tablero —no solo el formulario—.
 *
 * Cada caso crea su propio proyecto: el runner de CI ejecuta `migrate` sobre
 * una base vacía y nunca el seed, así que depender de datos sembrados haría
 * que la prueba pasara en local y fallara en la tubería.
 */

test('la plantilla «flujo controlado» deja el límite puesto, visible y editable', async ({
  page,
}) => {
  const sufijo = Date.now().toString(36);
  const proyecto = `E2E limites ${sufijo}`;

  await page.goto('/');
  await page.getByRole('button', { name: 'Nuevo proyecto' }).click();

  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel('Nombre').fill(proyecto);

  // 1. Al crear se ofrece una intención, no un número por columna: las columnas
  //    todavía no existen.
  await expect(dialogo.getByLabel(/^Límite de trabajo en curso de/)).toHaveCount(0);
  const flujoControlado = dialogo.getByRole('radio', { name: /Flujo controlado/ });
  await expect(flujoControlado).toContainText('2');
  await flujoControlado.click();
  await dialogo.getByRole('button', { name: 'Crear proyecto' }).click();

  // 2. El límite se aplicó de verdad: el tablero lo muestra en su cabecera.
  await page
    .locator('article')
    .filter({ hasText: proyecto })
    .getByRole('link', { name: /^Abrir tareas de/ })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: proyecto })).toBeVisible();

  const enCurso = page.getByRole('region', { name: 'En curso' });
  await expect(enCurso).toContainText('0/2');

  // 3. Y está donde Juan lo busca: al pulsar «Editar», con su valor cargado.
  await page.getByRole('button', { name: 'Editar' }).click();
  const edicion = page.getByRole('dialog');
  const campo = edicion.getByLabel('Límite de trabajo en curso de En curso');
  await expect(campo).toHaveValue('2');

  // Una columna terminal no ofrece campo: limitar lo ya terminado no significa
  // nada, y el CHECK de la base lo rechazaría.
  await expect(edicion.getByLabel('Límite de trabajo en curso de Completada')).toHaveCount(0);

  // 4. Cambiarlo ahí surte efecto en el tablero, no solo en el formulario.
  await campo.fill('4');
  await edicion.getByLabel('Nombre').click(); // blur que guarda
  await edicion.getByRole('button', { name: 'Cancelar' }).click();
  await expect(enCurso).toContainText('0/4');

  // 5. Y sobrevive a la recarga, porque el estado vive en PostgreSQL.
  await page.reload();
  await expect(page.getByRole('region', { name: 'En curso' })).toContainText('0/4');
});

test('sin plantilla, el proyecto nace sin ningún límite', async ({ page }) => {
  const sufijo = Date.now().toString(36);
  const proyecto = `E2E sin limites ${sufijo}`;

  await page.goto('/');
  await page.getByRole('button', { name: 'Nuevo proyecto' }).click();

  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel('Nombre').fill(proyecto);
  // No se toca la plantilla: «sin límites» es lo preestablecido.
  await dialogo.getByRole('button', { name: 'Crear proyecto' }).click();

  await page
    .locator('article')
    .filter({ hasText: proyecto })
    .getByRole('link', { name: /^Abrir tareas de/ })
    .click();

  // Sin límite, la cabecera muestra el conteo a secas y no el «n/m».
  const enCurso = page.getByRole('region', { name: 'En curso' });
  await expect(enCurso).toBeVisible();
  await expect(enCurso).not.toContainText('/');

  // El campo existe en la edición, vacío, listo para ponerlo cuando haga falta.
  await page.getByRole('button', { name: 'Editar' }).click();
  await expect(
    page.getByRole('dialog').getByLabel('Límite de trabajo en curso de En curso'),
  ).toHaveValue('');
});

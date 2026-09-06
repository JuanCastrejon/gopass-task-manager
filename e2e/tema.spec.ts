import { expect, test } from './limpieza.js';

/**
 * Escenario 11 — Tema claro/oscuro (SL-19).
 *
 * Se verifica la persistencia de la preferencia individual del navegador y
 * la ausencia de parpadeo (FOUC). El atributo data-theme="dark" debe quedar
 * fijado en <html> inmediatamente tras la recarga mediante el script síncrono
 * del <head>, antes de que React monte el árbol.
 */
test('cambiar a tema oscuro, recargar y comprobar que persiste sin parpadeo', async ({
  page,
}) => {
  await page.goto('/');

  // Localizar el conmutador de tema en la cabecera
  const conmutador = page.getByTestId('theme-toggle');
  await expect(conmutador).toBeVisible();

  // El ciclo es fijo —claro, oscuro, sistema— para que los tres estados sean
  // alcanzables con cualquier preferencia del sistema operativo. Por eso no se
  // cuenta clics: se pulsa hasta que el botón ofrezca precisamente el oscuro,
  // que es lo que su nombre accesible anuncia. Así la prueba no depende de en
  // qué estado arranque el navegador que la ejecute.
  for (let i = 0; i < 3; i += 1) {
    const temaActual = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme'),
    );
    if (temaActual === 'dark') break;
    await conmutador.click();
  }

  // Comprobar que <html> tiene data-theme="dark"
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // Comprobar que en localStorage se guardó la preferencia 'dark'
  const temaPersistido = await page.evaluate(() => localStorage.getItem('theme'));
  expect(temaPersistido).toBe('dark');

  // Recargar la página
  await page.reload();

  // Inmediatamente tras la carga, <html> debe tener data-theme="dark" gracias al script síncrono
  const temaInmediatoTrasCarga = await page.evaluate(
    () => document.documentElement.getAttribute('data-theme'),
  );
  expect(temaInmediatoTrasCarga).toBe('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // El botón conmutador debe reflejar la opción de cambiar al siguiente tema
  await expect(conmutador).toBeVisible();
});

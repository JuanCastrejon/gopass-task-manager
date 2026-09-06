import { expect, test } from './limpieza.js';

/**
 * Escenario 10 — etiquetas de color por proyecto.
 *
 * Lo que solo se demuestra aquí es la cadena completa que atraviesa las tres
 * capas: una etiqueta creada desde su diálogo llega a la tarjeta como píldora,
 * el filtro por etiqueta reduce el tablero, y **el filtro sobrevive a la
 * recarga** porque vive en la URL y no en el estado del componente.
 *
 * Las pruebas de API ya cubren las reglas del motor —la clave foránea
 * compuesta que impide etiquetas de otro proyecto, el 409 al borrar una en
 * uso—; esto cubre que una persona pueda ejercerlas desde la interfaz.
 */
test('crear una etiqueta, asignarla, verla en la tarjeta y filtrar por ella, todo tras recargar', async ({
  page,
}) => {
  const sufijo = Date.now().toString(36);
  const proyecto = `E2E etiquetas ${sufijo}`;
  const etiqueta = `Urgente ${sufijo}`;
  const conEtiqueta = `Migrar pasarela ${sufijo}`;
  const sinEtiqueta = `Revisar contrato ${sufijo}`;

  await page.goto('/');

  await page.getByRole('button', { name: 'Nuevo proyecto' }).click();
  const dialogoProyecto = page.getByRole('dialog');
  await dialogoProyecto.getByLabel('Nombre').fill(proyecto);
  await dialogoProyecto.getByRole('button', { name: 'Crear proyecto' }).click();

  await page
    .locator('article')
    .filter({ hasText: proyecto })
    .getByRole('link', { name: /^Abrir tareas de/ })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: proyecto })).toBeVisible();

  // --- la etiqueta se crea en su propio diálogo, no en el de columnas ---
  await page.getByRole('button', { name: 'Etiquetas' }).click();
  const gestor = page.getByRole('dialog');
  await gestor.getByLabel('Nueva etiqueta').fill(etiqueta);
  // Por id y no por etiqueta: las filas de edición tienen su propio control
  // con `aria-label="Color de etiqueta"` y `getByLabel('Color')` sería ambiguo.
  await gestor.locator('#nueva-etiqueta-color').selectOption('red');
  await gestor.getByRole('button', { name: 'Añadir' }).click();
  await expect(gestor.getByText(etiqueta)).toBeVisible();
  await gestor.getByLabel('Cerrar').click();

  // --- dos tareas: una la lleva y la otra no, para que el filtro tenga algo que ocultar ---
  const porHacer = page.getByRole('region', { name: 'Por hacer' });

  await porHacer.getByRole('button', { name: 'Añadir tarea a Por hacer' }).click();
  const dialogoConEtiqueta = page.getByRole('dialog');
  await dialogoConEtiqueta.getByLabel('Título').fill(conEtiqueta);
  // El selector es un grupo de botones con `role="checkbox"`: la etiqueta no
  // se escribe, se marca.
  await dialogoConEtiqueta
    .getByRole('group', { name: 'Seleccionar etiquetas' })
    .getByRole('checkbox', { name: etiqueta })
    .click();
  await dialogoConEtiqueta.getByRole('button', { name: 'Crear tarea' }).click();

  await porHacer.getByRole('button', { name: 'Añadir tarea a Por hacer' }).click();
  const dialogoSinEtiqueta = page.getByRole('dialog');
  await dialogoSinEtiqueta.getByLabel('Título').fill(sinEtiqueta);
  await dialogoSinEtiqueta.getByRole('button', { name: 'Crear tarea' }).click();

  await expect(porHacer.getByText(conEtiqueta)).toBeVisible();
  await expect(porHacer.getByText(sinEtiqueta)).toBeVisible();

  // --- la píldora se ve en la tarjeta, y solo en la que la lleva ---
  const tarjetaConEtiqueta = page.locator('article').filter({ hasText: conEtiqueta });
  await expect(tarjetaConEtiqueta.getByTestId('label-badge')).toHaveText(etiqueta);

  const tarjetaSinEtiqueta = page.locator('article').filter({ hasText: sinEtiqueta });
  await expect(tarjetaSinEtiqueta.getByTestId('label-badge')).toHaveCount(0);

  // --- filtrar deja solo la que la lleva ---
  const filtros = page.getByRole('group', { name: 'Filtrar tareas por etiqueta' });
  await filtros.getByRole('button', { name: etiqueta }).click();

  await expect(porHacer.getByText(conEtiqueta)).toBeVisible();
  await expect(porHacer.getByText(sinEtiqueta)).toHaveCount(0);

  // --- y sobrevive a la recarga, porque el filtro vive en la URL ---
  await page.reload();

  const filtroTrasRecargar = page
    .getByRole('group', { name: 'Filtrar tareas por etiqueta' })
    .getByRole('button', { name: etiqueta });
  await expect(filtroTrasRecargar).toHaveAttribute('aria-pressed', 'true');

  const porHacerTrasRecargar = page.getByRole('region', { name: 'Por hacer' });
  await expect(porHacerTrasRecargar.getByText(conEtiqueta)).toBeVisible();
  await expect(porHacerTrasRecargar.getByText(sinEtiqueta)).toHaveCount(0);
  await expect(
    page.locator('article').filter({ hasText: conEtiqueta }).getByTestId('label-badge'),
  ).toHaveText(etiqueta);
});

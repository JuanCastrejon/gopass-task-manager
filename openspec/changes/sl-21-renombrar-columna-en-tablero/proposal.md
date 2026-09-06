# Proposal: SL-21 — Renombrar una columna desde la cabecera del tablero

## Why

Renombrar una lista exigía abrir el diálogo modal «Columnas» para cambiar una palabra. En un
tablero que se ajusta a diario —«En curso» pasa a «En desarrollo», «Completada» a «Desplegada»—,
ese peaje desincentiva mantener los nombres al día, y un tablero con nombres obsoletos deja de
comunicar el flujo real de trabajo.

## What Changes

- **WP1 — Edición en el sitio (`web/src/features/tasks/CabeceraColumna.tsx`):**
  - `<h3><button type="button">Nombre</button></h3>` que conmuta a `<input>` al activarse.
  - Al abrir: se monta el campo, el foco se transfiere y el texto queda seleccionado. Al salir: se
    restaura el encabezado y **el foco vuelve al botón**.
  - Pulsación simple, ni doble clic —no fiable en táctil— ni `hover`, que en móvil no existe.
  - `Enter` guarda, `Escape` cancela restaurando el valor previo, y el `blur` guarda si el valor
    cambió y no queda vacío tras recortar.
- **WP2 — Nombre accesible correcto:** `aria-label="Renombrar columna: X"`. Se descartó `title`
  porque el texto visible del botón gana sobre él al calcular el nombre accesible: un lector de
  pantalla anunciaba «Por hacer, botón», sin indicar el propósito. La etiqueta incluye el nombre
  visible, así que cumple WCAG 2.5.3 «Label in Name».
- **WP3 — Convivencia con el arrastre, en las dos direcciones:** mientras se arrastra una tarjeta
  el botón queda deshabilitado, para que soltar sobre el título no abra la edición; y dentro del
  campo se detienen los eventos de puntero en fase de captura, para que seleccionar texto no
  inicie un arrastre.
- **WP4 — Conflicto de nombre:** ante el 409 por nombre duplicado el campo permanece abierto, con
  el foco dentro y `aria-invalid`, y el mensaje en una región con `role="alert"`.
- **WP5 — Pruebas:** 5 unitarias en `web/src/features/tasks/__tests__/renombrar-columna.test.tsx`
  y 1 E2E en `e2e/renombrar-columna.spec.ts`.

## Impact

- **Capacidades afectadas:** `tasks-board-web`. **El backend no cambia**: `useUpdateColumn` y
  `PATCH /api/projects/:projectId/columns/:id` ya existían.
- **Convive con el diálogo, no lo sustituye:** allí siguen la categoría de ciclo de vida, la
  posición, el límite y el borrado con reasignación obligatoria.
- **Alternativas descartadas:** `contenteditable`, errático en React e insertando `<div>` y `<br>`
  al pulsar Enter; y un `<input>` permanente con aspecto de texto, que rompe la jerarquía de
  encabezados y añade un punto de tabulación vacío por columna.

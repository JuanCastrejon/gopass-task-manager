# Proposal: SL-16 — Completar una tarea de un clic desde la tarjeta

## Why

Para marcar una tarea como completada, el usuario debía arrastrarla hasta la columna terminal
o pulsar reiteradamente la flecha de avance hasta cruzar todas las columnas intermedias. Esta
fricción contrastaba con la experiencia habitual de tableros kanban modernos (como Trello), donde
un control directo en la propia tarjeta permite sellar la finalización en un único gesto.

SL-16 introduce un control de verificación directo en la tarjeta que la traslada a una columna de
categoría `DONE`, respetando las garantías relacionales del motor de base de datos y sin añadir
campos redundantes en el backend.

## What Changes

- **WP1 — Control de completado en `TaskCard` (`web/src/features/tasks/TaskCard.tsx`):**
  - Círculo de verificación accesible a la izquierda del título.
  - Si el proyecto tiene una sola columna `DONE`, mueve la tarea directamente a dicha columna.
  - Si el proyecto cuenta con múltiples columnas `DONE`, despliega un menú accesible para que el
    usuario elija el destino de forma deliberada (nunca se elige arbitrariamente «la primera»).
  - En tareas completadas (`status = 'DONE'`), el círculo pasa a ser un indicador de estado visual y
    accesible no interactivo (verde con check, sin punto de tabulación ni botón inerte), manteniendo
    la flecha de retroceso hacia la columna anterior como mecanismo de reapertura de un solo clic.
  - Detención de eventos de puntero en fase de captura (`SIN_ARRASTRE`) para evitar interferencias con
    los sensores de arrastre de `@dnd-kit`.
  - Semántica accesible rigurosa: `<button type="button">` (nunca `role="checkbox"` ni `aria-pressed`),
    con `aria-haspopup="menu"`, `aria-expanded`, foco automático al primer destino del menú y tecla
    `Escape` para cancelar y devolver el foco al disparador.
- **WP2 — Integración en `TaskBoard` (`web/src/features/tasks/TaskBoard.tsx`):**
  - Derivación de columnas con categoría `DONE` (`columnasDone`) y paso de propiedades a cada `TaskCard`.
- **WP3 — Verificación y pruebas:**
  - 5 pruebas de componentes en `web/src/features/tasks/__tests__/completar-tarea.test.tsx` (clic directo,
    apertura de menú con varios destinos, rechazo del antipatrón de primera columna, indicador de estado
    en completadas y navegación por teclado accesible).
  - 2 pruebas E2E en Playwright (`e2e/completar-de-un-clic.spec.ts`): completado de un clic con columna
    única y menú de selección con múltiples columnas `DONE`.
  - ADR-027 documentado en `docs/spec/04-arquitectura.md`.
  - Cero cambios en la API (`api/` intacto).

## Capabilities

### Modified Capabilities
- `tasks-board-web` — control de completado de un clic, menú de destinos múltiples y semántica accesible.

## Decisiones con su porqué

**Mover la tarea a una columna `DONE` en lugar de un campo booleano `is_completed`.**
Desacoplar «completada» en un campo independiente rompería la invariante de que «completada» y
«estar en columna de categoría DONE» son la misma proposición. Exigiría modificar los 4 puntos del
backend que calculan avance y estadísticas desde `status = 'DONE'`, alteraría el contrato HTTP y
permitiría que una tarea completada en «En curso» siguiera consumiendo el límite de WIP (ADR-027).
Mover la tarea se implementó con cero cambios en el backend.

**Menú accesible ante múltiples destinos en vez de elegir «la primera».**
Cuando existen varias columnas terminales (ej. «Revisado» y «Desplegado»), elegir la primera columna
en silencio constituye un antipatrón que oculta reglas al usuario. Se verificó intencionadamente
rompiendo la prueba con el antipatrón de `usekaneo/kaneo` (`firstColumn`).

**Indicador de estado en lugar de botón de desmarcado en tareas completadas.**
El camino de vuelta ya existe y cuesta un único clic mediante la flecha hacia la columna anterior.
Un menú de reapertura costaría dos clics más gestión de foco para duplicar lo existente, y un botón
que no haga nada sería deshonesto con el usuario.

**Botón normal y no `role="checkbox"`.**
La acción traslada físicamente la tarjeta a otro contenedor en el tablero y en el DOM; prometer una
casilla de verificación a un usuario de lector de pantalla mentiría sobre lo que realmente ocurre.

## Exclusiones de alcance

- Modificaciones en el esquema de base de datos o endpoints de la API.
- Menús contextuales de reapertura en tarjetas completadas.

## Impact

Totalmente compatible y aditivo en el frontend. Coste medido en bundle: +0,92 kB gzip (89,60 -> 90,52 kB).

## Perfil de Readiness

`L1` en interfaz.

## Viabilidad y esfuerzo

- **Esfuerzo:** S
- **Riesgo técnico:** bajo — reutiliza la mutación existente de mover tarjeta.
- **Riesgo funcional:** bajo — blindado por pruebas de componentes y E2E.

# Proposal: SL-19 — Capa visual de Trello, tema claro/oscuro y fondo de tablero por proyecto

## Why

El producto resolvía bien el dominio y transmitía mal su carácter: una rejilla flexible que
deformaba las tarjetas según cuántas listas hubiera, un único tema claro fijo, y ningún elemento
que distinguiera un tablero de otro. Las operaciones de GoPass trabajan a diario sobre varios
tableros simultáneos y necesitan reconocer de un vistazo en cuál están.

SL-19 adopta la geometría de Trello —el estándar que el sector ya reconoce—, añade tema oscuro con
conmutador, y da a cada proyecto un fondo propio. Las tres piezas se entregan en pasos verificables
para que el árbol nunca quede a medias con el tema roto.

## What Changes

- **WP1 — Tema claro/oscuro (`web/src/index.css`, `web/index.html`, `web/src/lib/theme.ts`):**
  - Atributo `data-theme="light|dark"` en `<html>` con los tokens redefinidos bajo ese selector, en
    lugar de la variante `dark:` por componente, que llenaría el árbol de JSX de modificadores.
  - **Solo seis tokens estructurales redefinidos en oscuro** (`surface`, `canvas`, `border`, `ink`,
    `ink-muted`, `brand`). Los 6 pares semánticos y los 12 de etiqueta se derivan con `color-mix`:
    fondo al 18 % sobre la superficie, texto aclarado al 50 % hacia blanco.
  - Script síncrono en el `<head>` que fija el atributo antes del primer pintado, evitando el
    destello de tema claro. Preferencia en `localStorage` con caída a `prefers-color-scheme`.
  - Conmutador de tres estados con ciclo **fijo** claro → oscuro → sistema.
  - Dos tokens nuevos de foco (`--color-focus`, `--color-focus-halo`) con anillo doble.
  - Retirada de `--color-brand-soft` y `--color-status-todo-soft`, que no usaba ningún componente.
- **WP2 — Geometría y densidad (`web/src/features/tasks/TaskBoard.tsx`, `TaskCard.tsx`):**
  - Columnas de **272 px fijos** con desplazamiento horizontal desde `lg`, sustituyendo
    `auto-cols-[minmax(16rem,1fr)]`. El valor coincide en dos clones de Trello independientes.
  - El tablero **rompe el contenedor de 64rem** a partir de `lg` para usar el ancho real de la
    ventana, con el relleno compensatorio solo al inicio.
  - Densidad de tarjeta, radios y sombras al estilo de Trello, con los tokens del proyecto.
  - Por debajo de `lg` no cambia nada: el carrusel de una columna por pantalla ya estaba probado.
- **WP3 — Fondo de tablero por proyecto (`0011_fondo_de_tablero.sql`, `ProjectFormDialog.tsx`):**
  - Columna `projects.background text NOT NULL DEFAULT 'neutro'` con `CHECK` que cierra la paleta a
    seis valores en el propio motor, no solo en Zod.
  - Aplicación a sangre del degradado en el área del tablero, atenuado en tema oscuro.
  - Selección desde el diálogo de proyecto existente, sin crear otro.
- **WP4 — Pruebas:**
  - 3 unitarias del módulo de tema y 5 del conmutador en `web/src/lib/__tests__/theme.test.ts` y
    `web/src/components/ui/__tests__/ThemeToggle.test.tsx`.
  - Pruebas de API del campo `background` y del `CHECK` en `api/tests/integration/projects.test.ts`.
  - E2E `e2e/tema.spec.ts`, `e2e/geometria-columnas.spec.ts` y `e2e/fondo-proyecto.spec.ts`.
- **WP5 — Documentación:** ADR-031 y ADR-032 en `docs/spec/04-arquitectura.md`, más las mediciones
  de contraste en `docs/spec/08-verificacion-postgres.md`.

## Impact

- **Capacidades afectadas:** `tasks-board-web` (geometría, tema), `projects-api` (fondo).
- **Compatibilidad:** el fondo por defecto es `neutro`, así que un proyecto existente se ve igual.
- **Riesgo asumido:** el rediseño podía romper pruebas de presentación. Se midió antes de empezar:
  de los 283 selectores E2E, **276 van por rol o nombre accesible** y los 7 restantes por
  `data-testid` estable. El riesgo real quedó acotado a 8 aserciones sobre clases en 2 archivos.

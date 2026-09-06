# Proposal: SL-22 — Los límites de trabajo en curso y su espacio de configuración

## Why

Los límites existían desde SL-12 y vivían por columna desde ADR-023, pero solo se podían tocar
desde un campo escondido dentro del diálogo «Columnas». El problema, medido, **no era de
arquitectura sino de descubribilidad**: un proyecto nuevo nace sin ningún límite —el trigger
`projects_create_default_columns` crea las tres columnas con `wip_limit` a NULL, y el `2` de la
demostración lo ponía solo el seed—, y quien quería poner uno no encontraba dónde.

Juan lo pidió con estas palabras: que los límites «tengan su espacio de configuración y no se
impongan arbitrariamente», con un sitio al crear el proyecto y otro dentro. Y señaló dónde los
busca: al pulsar «Editar».

## What Changes

Tres superficies sobre **el mismo campo y la misma API**, así que no pueden divergir.

- **WP1 — Plantilla al crear (`api`, `web/.../ProjectFormDialog.tsx`):** las columnas todavía no
  existen, así que se ofrece una intención —«sin límites» o «flujo controlado», con el 2 a la
  vista— en vez de números para columnas sin nombre. `sin_limites` es lo preestablecido.
- **WP2 — Límites por columna al editar el proyecto:** el mismo diálogo, en modo edición, lista las
  columnas con su límite editable. Es donde se buscan. Escribe por
  `PATCH /api/projects/:id/columns/:columnId`, que ya existía.
- **WP3 — El diálogo de columnas se llama «Columnas y límites»:** nombra lo que contiene desde
  SL-12. Ajuste fino sin salir del contexto del tablero.
- **WP4 — Backend en transacción (`api/src/modules/projects/projects.repository.ts`):**
  `BEGIN` → `INSERT INTO projects` (dispara el trigger) →
  `UPDATE project_columns ... WHERE category = 'IN_PROGRESS'` → `COMMIT`. Con guarda de `rowCount`
  y `release()` en `finally`.

**El modelo de datos no se toca.** ADR-023 dejó el límite por columna porque un proyecto puede
tener varias columnas `IN_PROGRESS`; lo que se mueve es dónde se configura, no dónde se guarda.

## Impact

- **Nuevo ADR-035** con la decisión y las tres alternativas descartadas.
- **Nuevo código de error** `WIP_TEMPLATE_NO_TARGET` en el catálogo RFC 7807.
- `useColumns` acepta `enabled`: el diálogo lo monta también al crear, cuando no hay proyecto.
- Sin migraciones. Sin cambios de esquema.

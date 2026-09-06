# Tasks: SL-22 — Los límites y su espacio de configuración

## 1. Backend

- [x] 1.1 `WIP_TEMPLATES` y `LIMITE_FLUJO_CONTROLADO` en `projects.schema.ts`, con `wipTemplate`
      opcional y por defecto `sin_limites` en `createProjectSchema`.
- [x] 1.2 `createProject` pasa a `pool.connect()` con `BEGIN`/`COMMIT`/`ROLLBACK` y aplica la
      plantilla sobre todas las columnas `IN_PROGRESS`.
- [x] 1.3 Guarda de `rowCount === 0` → `WipTemplateNoTargetError` (500) y `release()` en `finally`.
- [x] 1.4 Código `WIP_TEMPLATE_NO_TARGET` en el catálogo y su título RFC 7807.

## 2. Interfaz

- [x] 2.1 Plantilla al crear, como `radiogroup`, con el número visible.
- [x] 2.2 Límites por columna al editar, uno por fila, guardando al salir del campo.
- [x] 2.3 Una columna terminal no ofrece campo en ninguna superficie.
- [x] 2.4 El diálogo de columnas se renombra a «Columnas y límites».
- [x] 2.5 `useColumns` acepta `enabled` para no pedir columnas al crear.

## 3. Pruebas

- [x] 3.1 Seis casos de integración: sin plantilla, campo omitido, plantilla aplicada, columnas no
      afectadas, límite revocable y plantilla desconocida.
- [x] 3.2 Ocho casos de web sobre lo que llega a la API en cada superficie.
- [x] 3.3 Dos E2E: la plantilla llega a PostgreSQL por la interfaz, y sin plantilla no hay límite.
- [x] 3.4 Validadas rompiendo el código en cuatro sentidos distintos y comprobando el rojo.

## 4. Documentación

- [x] 4.1 ADR-035.
- [x] 4.2 Recuentos en `README.md` y `docs/spec/05-estrategia-calidad.md`.

## 5. Pendiente

- [ ] 5.1 El contrato de `POST /api/projects` en `docs/spec/03-contrato-api.md` y en el OpenAPI no
      documentan todavía el campo `wipTemplate` ni el código `WIP_TEMPLATE_NO_TARGET`.
- [ ] 5.2 `docs/api.http` no ejercita la creación con plantilla.

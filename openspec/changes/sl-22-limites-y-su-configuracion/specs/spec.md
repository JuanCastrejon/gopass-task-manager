# Spec: SL-22 — Los límites y su espacio de configuración

## ADDED Requirements

### Requirement: Plantilla de límites al crear un proyecto

`POST /api/projects` acepta `wipTemplate`, con valores `sin_limites` y `flujo_controlado`. El campo
es opcional y su ausencia equivale a `sin_limites`.

#### Scenario: sin plantilla, el proyecto nace sin límites
- **WHEN** se crea un proyecto sin `wipTemplate`, o con `sin_limites`
- **THEN** sus tres columnas iniciales tienen `wipLimit` en `null`

#### Scenario: flujo controlado deja el límite puesto
- **WHEN** se crea un proyecto con `wipTemplate: "flujo_controlado"`
- **THEN** todas sus columnas de categoría `IN_PROGRESS` quedan con `wipLimit` en 2
- **AND** las de categoría `TODO` y `DONE` quedan en `null`

#### Scenario: la plantilla es revocable
- **WHEN** se quita el límite con `PATCH /api/projects/:id/columns/:columnId` y `wipLimit: null`
- **THEN** la columna queda sin límite, porque la plantilla es un valor por defecto y no una
  invariante

#### Scenario: plantilla desconocida
- **WHEN** se envía un `wipTemplate` que no está en el catálogo
- **THEN** la API responde 400 con `VALIDATION_ERROR` señalando el campo `wipTemplate`

### Requirement: Atomicidad de la creación con plantilla

La creación y la aplicación de la plantilla ocurren en una sola transacción.

#### Scenario: no existe proyecto a medio configurar
- **WHEN** la aplicación de la plantilla falla
- **THEN** la creación entera se deshace y el proyecto no existe

### Requirement: Los límites se editan desde el proyecto

El diálogo de edición de proyecto lista sus columnas con el límite de cada una.

#### Scenario: el valor actual se muestra y se puede cambiar
- **WHEN** se abre «Editar» sobre un proyecto
- **THEN** cada columna no terminal muestra su límite actual, o vacío si no tiene
- **AND** cambiarlo lo guarda al salir del campo, y vaciarlo lo quita

#### Scenario: una columna terminal no admite límite
- **WHEN** se listan las columnas de un proyecto
- **THEN** las de categoría `DONE` no ofrecen campo de límite en ninguna superficie

# Spec: SL-21 — Renombrar una columna desde la cabecera

## ADDED Requirements

### Requirement: Edición en el sitio del nombre de columna

Pulsar el título de una columna DEBE permitir renombrarla sin abrir un diálogo.

#### Scenario: Abrir la edición
- **WHEN** se pulsa el título
- **THEN** aparece un campo con el texto seleccionado y el foco dentro

#### Scenario: Guardar y cancelar
- **WHEN** se pulsa `Enter` con un valor nuevo
- **THEN** se guarda y el nombre nuevo sobrevive a la recarga
- **WHEN** se pulsa `Escape`
- **THEN** se restaura el valor previo, no se llama a la API y el foco vuelve al botón

#### Scenario: Sin cambios no hay petición
- **WHEN** el valor queda idéntico o vacío tras recortar espacios
- **THEN** no se envía ninguna petición

### Requirement: Nombre accesible que declara la acción

#### Scenario: Lector de pantalla
- **WHEN** el foco llega al título de una columna
- **THEN** el nombre accesible declara la acción e incluye el nombre visible de la columna

### Requirement: Conflicto de nombre sin perder lo escrito

#### Scenario: Nombre duplicado en el mismo proyecto
- **WHEN** la API responde 409
- **THEN** el campo permanece abierto, con el foco dentro, y el mensaje aparece en `role="alert"`

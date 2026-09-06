# Spec: SL-20 — Precisión del arrastre entre columnas

## ADDED Requirements

### Requirement: Elegir la posición al mover una tarea a otra columna

Soltar una tarjeta sobre una posición concreta de otra columna con orden manual DEBE respetarla.

#### Scenario: Soltar sobre la mitad superior de la primera tarjeta
- **WHEN** se suelta sobre el cuarto superior de la primera tarjeta del destino
- **THEN** la tarea queda la primera, con posición 512

#### Scenario: Soltar sobre la mitad inferior de la última tarjeta
- **WHEN** se suelta sobre la mitad inferior de la última tarjeta
- **THEN** la tarea queda al final, con posición `MAX + 1024`

### Requirement: Indicador de inserción

El destino DEBE ser visible antes de soltar, y solo donde la posición se puede elegir.

#### Scenario: Columna con orden automático
- **WHEN** se sobrevuela una columna cuyo orden no es manual
- **THEN** no aparece indicador de inserción y la columna no cambia a manual

### Requirement: Destino no válido por límite de trabajo en curso

#### Scenario: Soltar en una columna llena
- **WHEN** la columna destino alcanzó su límite
- **THEN** se marca como destino no válido y soltar no dispara ninguna petición

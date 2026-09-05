## ADDED Requirements

### Requirement: Tablero de tres columnas por estado (RF-11)

#### Scenario: Apertura del detalle de un proyecto
- **GIVEN** un proyecto con tareas en varios estados
- **WHEN** se abre su vista
- **THEN** se ven tres columnas —por hacer, en curso y completada— con la prioridad visible en cada tarjeta

#### Scenario: Recarga de la página
- **GIVEN** un tablero con tareas repartidas
- **WHEN** se recarga
- **THEN** el agrupamiento se mantiene, porque la verdad está en PostgreSQL y no en el estado de React

### Requirement: Transición de estado desde la tarjeta (RF-09)

#### Scenario: Avanzar una tarea
- **GIVEN** una tarea en `TODO`
- **WHEN** se pulsa la flecha de avance dos veces
- **THEN** llega a la columna de completada
- **AND** el avance del proyecto se recalcula y la barra lo refleja

#### Scenario: Navegación por teclado
- **GIVEN** un tablero con tareas
- **WHEN** se recorre con el teclado
- **THEN** cada control de transición tiene nombre accesible con el destino explícito

### Requirement: El estado de los filtros vive en la URL (RF-13)

#### Scenario: Aplicar un filtro
- **GIVEN** el tablero de un proyecto
- **WHEN** se filtra por prioridad alta y se busca un término
- **THEN** la URL pasa a llevar `?priority=HIGH&q=<término>`

#### Scenario: Compartir o guardar la vista
- **GIVEN** una URL con filtros
- **WHEN** se abre en otra pestaña
- **THEN** el tablero aparece ya filtrado, sin pasos adicionales

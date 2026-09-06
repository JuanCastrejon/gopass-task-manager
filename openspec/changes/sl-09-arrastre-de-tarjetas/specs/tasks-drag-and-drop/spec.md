## ADDED Requirements

### Requirement: Mover una tarea arrastrándola entre columnas

#### Scenario: Arrastre con ratón a una columna distinta
- **GIVEN** una tarea en «Por hacer» y el tablero en modo rejilla
- **WHEN** se arrastra su tarjeta hasta «Completada» y se suelta
- **THEN** la tarjeta queda en «Completada» y el avance del proyecto se recalcula
- **AND** el cambio sobrevive a una recarga, porque la verdad está en PostgreSQL

#### Scenario: Cualquier columna es destino válido
- **GIVEN** una tarea en «Por hacer»
- **WHEN** se suelta directamente en «Completada», saltándose «En curso»
- **THEN** la transición se aplica
- **AND** el trigger sella `completed_at` igual que por cualquier otra vía

#### Scenario: Soltar fuera de una columna
- **GIVEN** una tarjeta que se está arrastrando
- **WHEN** se suelta sobre una zona que no es columna
- **THEN** vuelve a su posición original con una animación
- **AND** no se dispara ninguna petición

#### Scenario: Soltar en la columna de origen
- **GIVEN** una tarjeta arrastrada dentro de su propia columna
- **WHEN** se suelta
- **THEN** no se dispara ninguna petición: no hay cambio que persistir

### Requirement: El gesto de arrastre no interfiere con el del carrusel

#### Scenario: Deslizamiento rápido en móvil
- **GIVEN** el tablero en modo carrusel, por debajo de `lg`
- **WHEN** el dedo se desliza sobre una tarjeta antes de cumplirse 250 ms
- **THEN** el arrastre no se activa y el carrusel se desplaza como siempre

#### Scenario: Pulsación mantenida en móvil
- **GIVEN** el mismo tablero
- **WHEN** el dedo mantiene la tarjeta pulsada más de 250 ms
- **THEN** el arrastre se activa
- **AND** el anclaje de desplazamiento se desactiva mientras dura, para que el carrusel no tire de la vista hacia la columna centrada

### Requirement: Los controles de la tarjeta siguen siendo accesibles

#### Scenario: Pulsar un control dentro de la superficie arrastrable
- **GIVEN** una tarjeta con sus botones de editar, borrar y las dos flechas
- **WHEN** se pulsa cualquiera de ellos
- **THEN** ejecuta su acción y no inicia un arrastre

#### Scenario: Alternativa sin arrastre
- **GIVEN** una persona que no puede realizar un gesto de arrastre
- **WHEN** usa las flechas de transición
- **THEN** puede mover la tarea igualmente, como exige WCAG 2.2 SC 2.5.7
- **AND** el foco se conserva al remontarse la tarjeta en la nueva columna

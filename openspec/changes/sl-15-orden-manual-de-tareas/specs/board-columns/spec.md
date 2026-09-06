## ADDED Requirements

### Requirement: Orden manual de tareas dentro de una columna mediante arrastre

#### Scenario: Reordenar dos tareas en columna con orden manual
- **GIVEN** una columna configurada con `sort = 'manual'` y dos tareas A y B
- **WHEN** el usuario arrastra la tarjeta B por encima de la tarjeta A
- **THEN** la tarjeta B se posiciona inmediatamente antes de A
- **AND** el servidor calcula una posición fraccionaria persistida en PostgreSQL
- **AND** el nuevo orden sobrevive a una recarga completa de la página

#### Scenario: Inserción entre dos tareas existentes
- **GIVEN** dos tareas con posiciones $a$ y $b$ dentro de una columna manual
- **WHEN** se suelta una tercera tarjeta entre ambas
- **THEN** el servidor asigna $(a + b) / 2.0$ en $O(1)$ sin renumerar el resto de la columna

#### Scenario: Inserción al principio o al final
- **WHEN** una tarea se mueve a la primera posición de una columna manual
- **THEN** se asigna la mitad de la posición de la primera tarjeta existente
- **WHEN** se mueve a la última posición
- **THEN** se asigna la posición máxima actual más 1024.0

### Requirement: Bloqueo explícito en columnas con orden automático

#### Scenario: Aviso visible de orden automático
- **GIVEN** una columna con criterio automático (`created_asc`, `created_desc`, `priority_asc` o `priority_desc`)
- **THEN** la interfaz muestra un aviso explicativo visible indicando que la columna tiene orden automático
- **AND** explica que debe cambiarse el criterio a manual para habilitar el reordenado

#### Scenario: Intento de arrastre interno en columna automática
- **GIVEN** una columna con orden automático
- **WHEN** el usuario intenta arrastrar una tarjeta dentro de la misma columna
- **THEN** la operación queda bloqueada sin disparar peticiones de red
- **AND** el orden previo permanece inalterado incluso tras recargar

### Requirement: Detección de colisión de precisión y rebalanceo atómico

#### Scenario: Colapso de precisión tras divisiones consecutivas
- **GIVEN** 52 divisiones fraccionarias sucesivas en un mismo hueco
- **WHEN** la división número 53 colapsa numéricamente contra el extremo
- **THEN** la restricción `tasks_position_unica (column_id, position)` rechaza la duplicación con `SQLSTATE 23505`
- **AND** el servidor ejecuta un rebalanceo automático espaciando las tarjetas a 1024.0 y reintenta con éxito

#### Scenario: Colisión concurrente
- **GIVEN** dos peticiones simultáneas que calculan la misma posición fraccionaria
- **WHEN** la segunda intenta insertar
- **THEN** la restricción única `tasks_position_unica` detiene la colisión en el motor
- **AND** la segunda transacción rebalancea y reintenta sin duplicar posiciones en silencio

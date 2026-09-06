## ADDED Requirements

### Requirement: Cada columna ordena sus tareas por su propio criterio

#### Scenario: Criterio por defecto
- **GIVEN** una columna recién creada
- **THEN** ordena por prioridad alta primero, que es el criterio histórico del tablero

#### Scenario: Cambiar el criterio
- **WHEN** se elige «prioridad baja primero» en una columna
- **THEN** solo esa columna cambia de orden
- **AND** las demás conservan el suyo

#### Scenario: Criterios ofrecidos
- **THEN** son cuatro: prioridad descendente, prioridad ascendente, más recientes y más antiguas
- **AND** no se ofrece orden alfabético, que no responde a ninguna decisión de trabajo

#### Scenario: Un criterio inexistente
- **WHEN** se envía un criterio fuera del dominio
- **THEN** la API responde 400

### Requirement: El orden es configuración compartida, no preferencia local

#### Scenario: Lo ve todo el equipo
- **GIVEN** una columna cuyo criterio se acaba de cambiar
- **WHEN** otra petición cualquiera consulta el tablero
- **THEN** recibe el mismo criterio
- **AND** no depende de sesión, cabecera ni almacenamiento del navegador

#### Scenario: Sobrevive a la recarga
- **WHEN** se recarga la página
- **THEN** cada columna conserva el criterio elegido

### Requirement: El orden se resuelve en la consulta, no en el cliente

#### Scenario: Tres columnas con tres criterios distintos
- **GIVEN** un tablero cuyas columnas ordenan por prioridad descendente, por antigüedad y por prioridad ascendente
- **WHEN** se listan sus tareas
- **THEN** llegan ya ordenadas correctamente dentro de cada columna
- **AND** en **una sola** consulta: ni una por columna, ni ordenación en cliente sobre un array ya descargado

#### Scenario: Orden estable
- **GIVEN** dos tareas que empatan en el criterio elegido
- **WHEN** se lista el tablero dos veces seguidas
- **THEN** aparecen en el mismo orden las dos veces

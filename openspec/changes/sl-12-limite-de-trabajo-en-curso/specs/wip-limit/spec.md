## ADDED Requirements

### Requirement: Un proyecto puede declarar cuánto trabajo simultáneo admite

#### Scenario: Proyecto sin límite
- **GIVEN** un proyecto recién creado
- **WHEN** se consulta su resumen
- **THEN** `wipLimit` es `null` y no se impone nada
- **AND** se pueden poner en curso tantas tareas como haga falta

#### Scenario: Declarar el límite
- **GIVEN** un proyecto existente
- **WHEN** se envía `PATCH /api/projects/:id` con `wipLimit: 3`
- **THEN** el resumen devuelve `wipLimit: 3` junto a `inProgressCount`

#### Scenario: Un límite de 0 o negativo se rechaza
- **WHEN** se envía `wipLimit: 0` o `wipLimit: -3`
- **THEN** la API responde 400
- **AND** la base tiene además un `CHECK` que lo impediría aunque la validación fallara

#### Scenario: Retirar el límite
- **GIVEN** un proyecto con límite
- **WHEN** se envía `wipLimit: null`
- **THEN** el límite desaparece y deja de imponerse

### Requirement: El límite se impone al entrar en «En curso»

#### Scenario: Mover una tarea con hueco disponible
- **GIVEN** un proyecto con límite 2 y una tarea en curso
- **WHEN** se mueve otra tarea a `IN_PROGRESS`
- **THEN** la API responde 200 y la tarea entra

#### Scenario: Mover una tarea con el límite lleno
- **GIVEN** un proyecto con límite 2 y dos tareas en curso
- **WHEN** se intenta mover una tercera
- **THEN** la API responde **409 `WIP_LIMIT_REACHED`**
- **AND** el `detail` dice cuál es el límite
- **AND** la tarea sigue en su columna: el 409 no deja el tablero a medias

#### Scenario: Crear una tarea directamente en curso
- **GIVEN** un proyecto con el límite lleno
- **WHEN** se crea una tarea con `status: IN_PROGRESS`
- **THEN** también se rechaza con 409: consume el mismo cupo

#### Scenario: Editar una tarea que ya está en curso
- **GIVEN** un proyecto con el límite lleno
- **WHEN** se corrige el título de una tarea que ya está en curso
- **THEN** la operación se acepta
- **AND** la propia tarea no se cuenta dos veces contra el límite

#### Scenario: Liberar cupo
- **GIVEN** un proyecto con el límite lleno
- **WHEN** una tarea en curso pasa a `DONE` o vuelve a `TODO`
- **THEN** queda hueco y la siguiente entra sin error

#### Scenario: Dos movimientos simultáneos no se saltan el límite
- **GIVEN** un proyecto con límite 1 y ninguna tarea en curso
- **WHEN** llegan dos peticiones a la vez para poner sendas tareas en curso
- **THEN** exactamente una responde 200 y la otra 409
- **AND** el proyecto acaba con una sola tarea en curso

#### Scenario: Bajar el límite por debajo del uso actual
- **GIVEN** un proyecto con tres tareas en curso
- **WHEN** se declara un límite de 1
- **THEN** las tres siguen en curso: no se expulsa a nadie
- **AND** cualquier entrada nueva se rechaza hasta volver por debajo del límite

### Requirement: El tablero anuncia la capacidad antes de que se agote

#### Scenario: Contador en la columna
- **GIVEN** un proyecto con límite 2 y una tarea en curso
- **WHEN** se abre su tablero
- **THEN** la cabecera de «En curso» muestra `1/2`
- **AND** las otras dos columnas muestran solo su recuento, porque el límite no les aplica

#### Scenario: Señal al alcanzarlo
- **GIVEN** el mismo proyecto con dos tareas en curso
- **THEN** el contador se muestra en color de peligro

#### Scenario: El rechazo se explica
- **WHEN** un movimiento se rechaza por el límite
- **THEN** la interfaz muestra el mensaje del servidor, con el límite concreto y qué hacer

## ADDED Requirements

### Requirement: Fecha de vencimiento y semáforo visual en el cliente

#### Scenario: Visualización de fecha con semáforo según proximidad
- **GIVEN** una tarea con fecha de vencimiento asignada en formato `YYYY-MM-DD`
- **WHEN** la fecha es anterior al día actual del cliente
- **THEN** la insignia muestra estilo de peligro en rojo con texto `Vencida · <fecha>`
- **WHEN** la fecha coincide con el día de hoy
- **THEN** la insignia muestra estilo de advertencia en ámbar con texto `Vence hoy · <fecha>`
- **WHEN** la fecha vence dentro de los próximos 3 días naturales
- **THEN** la insignia muestra estilo de advertencia en ámbar con texto `Vence pronto · <fecha>`
- **WHEN** la fecha dista más de 3 días en el futuro
- **THEN** la insignia muestra estilo neutro con la fecha corta

#### Scenario: Tarea completada con fecha de vencimiento
- **GIVEN** una tarea con fecha de vencimiento que pasa a estado `DONE`
- **THEN** la insignia de fecha pasa a tono neutro atenuado y deja de mostrar avisos de alarma
- **AND** en el diálogo de edición se indica si fue completada a tiempo o tarde según su fecha civil local

#### Scenario: Tarea sin fecha de vencimiento
- **GIVEN** una tarea sin fecha (`dueDate = null`)
- **THEN** la tarjeta no renderiza ninguna insignia de fecha

### Requirement: Ordenación de tareas por fecha de vencimiento

#### Scenario: Columna ordenada por fecha de vencimiento (`due_asc`)
- **GIVEN** una columna con criterio `sort = 'due_asc'` y tareas con distintas fechas y sin fecha
- **WHEN** se listan las tareas
- **THEN** las tareas se ordenan cronológicamente ascendente por `dueDate`
- **AND** las tareas sin fecha se sitúan al final de la columna (`NULLS LAST`)

#### Scenario: Convivencia con otros criterios de ordenación
- **GIVEN** una columna con orden por prioridad o fecha de creación
- **WHEN** las tareas tienen fechas de vencimiento asignadas
- **THEN** el orden respeta estrictamente el criterio de la columna sin alterarse por la fecha de vencimiento

### Requirement: Validación y persistencia de fecha

#### Scenario: Entrada de fecha válida y limpieza a nulo
- **WHEN** se envía una fecha válida `YYYY-MM-DD`
- **THEN** la API la almacena como `date` puro y la devuelve idéntica en formato `YYYY-MM-DD`
- **WHEN** se envía `dueDate: null`
- **THEN** la fecha se elimina de la tarea y queda en `null`

#### Scenario: Rechazo de formatos o fechas inválidas
- **WHEN** se envía una fecha con formato incorrecto o un día inexistente en calendario
- **THEN** la API responde `400 VALIDATION_ERROR` con mensaje en español indicando el error en el campo `dueDate`

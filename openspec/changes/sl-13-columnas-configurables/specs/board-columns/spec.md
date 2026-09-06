## ADDED Requirements

### Requirement: Todo proyecto tiene un tablero con columnas

#### Scenario: Tablero inicial
- **GIVEN** un proyecto recién creado
- **WHEN** se consultan sus columnas
- **THEN** tiene tres: «Por hacer», «En curso» y «Completada», en ese orden
- **AND** sus categorías son `TODO`, `IN_PROGRESS` y `DONE`

#### Scenario: Las crea el motor, no el servicio
- **GIVEN** un proyecto insertado directamente por SQL, sin pasar por la API
- **THEN** también recibe sus tres columnas
- **AND** por la misma razón que `completedAt` lo sella un trigger: una regla que solo viviera en la aplicación dejaría fuera al seed y a cualquier otro cliente

### Requirement: Las columnas se pueden añadir, renombrar, reordenar y eliminar

#### Scenario: Añadir una columna
- **WHEN** se crea una columna con nombre y categoría
- **THEN** se coloca al final del tablero
- **AND** la posición la calcula el servidor, no el cliente

#### Scenario: Varias columnas de la misma categoría
- **GIVEN** un tablero con «En curso»
- **WHEN** se añaden «En revisión» y «QA», ambas de categoría `IN_PROGRESS`
- **THEN** las tres conviven
- **AND** el panel agregado sigue contándolas juntas como trabajo en curso

#### Scenario: Nombre repetido
- **WHEN** se crea una columna cuyo nombre ya existe en el proyecto, ignorando mayúsculas y espacios
- **THEN** la API responde **409 `COLUMN_NAME_TAKEN`**

#### Scenario: Reordenar
- **WHEN** se envía el orden completo de las columnas
- **THEN** se aplica en una transacción
- **AND** un orden incompleto o con columnas ajenas se rechaza, porque dejaría columnas sin posición

#### Scenario: La categoría no se puede cambiar
- **WHEN** se intenta modificar la categoría de una columna existente
- **THEN** se rechaza con 400
- **AND** el motivo es que movería el estado de todas sus tareas por efecto colateral, sellando o borrando fechas de completado

#### Scenario: Una columna de otro proyecto
- **WHEN** se opera sobre una columna que pertenece a otro proyecto
- **THEN** la API responde **404 `COLUMN_NOT_FOUND`**

### Requirement: Eliminar una columna no destruye trabajo

#### Scenario: Columna vacía
- **WHEN** se elimina una columna sin tareas
- **THEN** se elimina y las posiciones restantes se recompactan a 1..N

#### Scenario: Columna con tareas y sin destino
- **WHEN** se intenta eliminar una columna que contiene tareas
- **THEN** la API responde **409 `COLUMN_HAS_TASKS`** e indica cuántas hay
- **AND** la columna sigue existiendo: mismo criterio que borrar un proyecto con tareas

#### Scenario: Columna con tareas y destino explícito
- **WHEN** se elimina indicando a qué columna se mueven las tareas
- **THEN** mover y borrar ocurren en la misma transacción
- **AND** si el destino tiene otra categoría, el estado de las tareas cambia con ellas y la fecha de completado se sella o se limpia en consecuencia

#### Scenario: El destino también tiene límite
- **GIVEN** una columna destino con el cupo lleno
- **WHEN** se intenta reasignarle más tareas de las que caben
- **THEN** se rechaza con **409 `WIP_LIMIT_REACHED`**: reasignar no es una excusa para saltarse el límite

#### Scenario: La última columna de una categoría
- **WHEN** se intenta eliminar la única columna `DONE` del proyecto
- **THEN** se rechaza con **409 `LAST_COLUMN_OF_CATEGORY`**
- **AND** el motivo es que sin columna terminal no habría forma de dar nada por terminado

### Requirement: La columna y el estado de una tarea no pueden divergir

#### Scenario: Mover una tarea a otra columna
- **WHEN** se mueve una tarea a una columna de otra categoría
- **THEN** su estado cambia en el mismo paso
- **AND** la fecha de completado se sella o se limpia según corresponda

#### Scenario: El motor lo impone, no la aplicación
- **WHEN** se intenta desde SQL mover una tarea a una columna terminal sin cambiar su estado
- **THEN** PostgreSQL lo rechaza por violación de clave foránea
- **AND** lo mismo al revés: cambiar el estado sin mover de columna
- **AND** solo se acepta el cambio atómico de ambos

#### Scenario: Mover entre dos columnas de la misma categoría
- **GIVEN** dos columnas terminales, «Entregado» y «Cerrado»
- **WHEN** una tarea pasa de una a otra
- **THEN** conserva su fecha de completado original: el estado no cambió

#### Scenario: `columnId` gana sobre `status`
- **WHEN** una petición envía los dos
- **THEN** manda `columnId`, porque es el único que distingue entre varias columnas de la misma categoría

#### Scenario: Compatibilidad con `status`
- **WHEN** una petición envía solo `status`
- **THEN** la tarea va a la primera columna de esa categoría, por posición

### Requirement: El límite de trabajo en curso es de la columna

#### Scenario: Límite por columna
- **GIVEN** un tablero con «Desarrollo» limitada a 3 y «QA» limitada a 2
- **THEN** cada una impone el suyo de forma independiente

#### Scenario: Una columna terminal no admite límite
- **WHEN** se intenta poner límite a una columna de categoría `DONE`
- **THEN** se rechaza: limitar lo ya terminado no significa nada

#### Scenario: El bloqueo es de la fila de la columna
- **WHEN** dos peticiones simultáneas intentan entrar en la misma columna con un solo hueco
- **THEN** exactamente una lo consigue
- **AND** dos peticiones hacia columnas distintas no se bloquean entre sí

### Requirement: El tablero se adapta al número de columnas

#### Scenario: Más de tres columnas
- **WHEN** un tablero tiene cuatro o más
- **THEN** la rejilla no colapsa: se reparten el ancho hasta donde caben y después el tablero se desplaza en horizontal

#### Scenario: Las flechas siguen siendo la alternativa sin arrastre
- **GIVEN** una tarjeta en un tablero de N columnas
- **THEN** sus flechas llevan a la columna anterior y a la siguiente **por posición**
- **AND** se alcanza cualquier columna paso a paso, que es lo que exige WCAG 2.2 SC 2.5.7

#### Scenario: Salto directo
- **WHEN** se quiere mover una tarea a una columna no contigua sin arrastrar
- **THEN** el diálogo de edición ofrece un desplegable con todas las columnas

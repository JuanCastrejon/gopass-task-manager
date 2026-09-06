## ADDED Requirements

### Requirement: Toda integración pasa por el mismo pipeline

#### Scenario: Pull request hacia la rama de integración
- **GIVEN** una rama con cambios
- **WHEN** se abre un PR contra `develop`
- **THEN** el workflow ejecuta lint, typecheck, pruebas de API contra PostgreSQL real, pruebas de web, build y E2E

#### Scenario: Fallo de cualquier etapa
- **GIVEN** una etapa que falla
- **WHEN** el workflow termina
- **THEN** el check queda en rojo y el PR no se considera integrable

### Requirement: Las pruebas de integración corren contra PostgreSQL real

#### Scenario: Aislamiento entre workers
- **GIVEN** la suite ejecutándose en paralelo
- **WHEN** cada worker arranca
- **THEN** usa su propia base `gopass_tasks_test_<n>`
- **AND** ejecutar la suite no altera los datos de demostración

### Requirement: Dos escenarios de punta a punta

#### Scenario: Ciclo de vida completo
- **GIVEN** la aplicación levantada
- **WHEN** Playwright crea un proyecto, le añade una tarea y la lleva a completada
- **THEN** el avance del proyecto refleja el cambio

#### Scenario: Conflicto de borrado
- **GIVEN** un proyecto con tareas
- **WHEN** Playwright intenta borrarlo
- **THEN** la interfaz muestra el conflicto explicado y el proyecto sigue existiendo

### Requirement: La calidad la adjudica un árbitro independiente

#### Scenario: Cobertura sobre líneas cambiadas
- **GIVEN** un cambio que toca código de la API
- **WHEN** corre `sdlc quality-gate --phase F8 --run`
- **THEN** adjudica el gate `F8.changed-lines-coverage` contra el umbral del tier

#### Scenario: Cambio que no toca superficie medida
- **GIVEN** un cambio solo documental
- **WHEN** el gate se evalúa
- **THEN** sale `vacuous` con su motivo escrito, no un aprobado silencioso

#### Scenario: Probe sin runner disponible
- **GIVEN** un gate cuyo probe está declarado `unavailable`
- **WHEN** el árbitro adjudica
- **THEN** el resultado es `not-applicable` con razón, porque NO MEDIDO e INCUMPLIDO no son lo mismo

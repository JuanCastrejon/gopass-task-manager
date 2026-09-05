## ADDED Requirements

### Requirement: El README arranca el proyecto sin conocimiento previo

#### Scenario: Evaluador que abre el repositorio por primera vez
- **GIVEN** el README
- **WHEN** se ejecutan sus comandos tal como están escritos
- **THEN** la aplicación queda operativa sin pasos implícitos

### Requirement: Cada decisión tiene su alternativa descartada

#### Scenario: Lectura del registro de decisiones
- **GIVEN** `docs/spec/04-arquitectura.md`
- **WHEN** se consulta cualquier ADR
- **THEN** declara la decisión, la alternativa descartada y su consecuencia

### Requirement: Todo requisito tiene prueba adjudicada

#### Scenario: Cruce de la matriz de trazabilidad
- **GIVEN** la matriz de `docs/spec/05-estrategia-calidad.md`
- **WHEN** se recorre cada RF con nivel MUST o SHOULD
- **THEN** cada uno referencia el endpoint o componente que lo implementa y la prueba que lo cubre

#### Scenario: Requisito descartado
- **GIVEN** un requisito con nivel WON'T
- **WHEN** se consulta la matriz
- **THEN** no aparece como entregado en ningún artefacto, ni en títulos de issue ni de PR

### Requirement: Colección de API ejecutable

#### Scenario: Recorrido del ciclo completo
- **GIVEN** `docs/api.http` y el stack levantado
- **WHEN** se disparan sus bloques en orden
- **THEN** se recorren los caminos felices y los de error, incluidos `400`, `404` y `409`

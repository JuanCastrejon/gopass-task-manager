# Tasks: SL-12 — Límite de trabajo en curso

## 1. Esquema

- [x] 1.1 Migración `0002_projects_wip_limit.sql` con `wip_limit integer NULL`
- [x] 1.2 `CHECK (wip_limit IS NULL OR wip_limit > 0)`: la regla también vive en el motor
- [x] 1.3 Índice `(project_id, status)` para el conteo que se hace en cada intento
- [x] 1.4 Migración reversible, con su bloque `Down`

## 2. Regla de negocio

- [x] 2.1 `verificarLimiteEnCurso` con `SELECT ... FOR UPDATE` sobre la fila del proyecto
- [x] 2.2 `conTransaccion` envuelve comprobación y escritura bajo el mismo bloqueo
- [x] 2.3 Se aplica al crear en curso y al mover hacia curso, no al salir ni al editar
- [x] 2.4 La tarea que ya está dentro se excluye del conteo
- [x] 2.5 `WipLimitReachedError` con el límite en el mensaje; 409, no 400

## 3. Contrato

- [x] 3.1 `wipLimit` e `inProgressCount` en `ProjectSummary`
- [x] 3.2 `wipLimit` aceptado en crear y parchear, con `null` para retirarlo
- [x] 3.3 Swagger: esquemas, y el 409 documentado en las dos rutas que pueden devolverlo
- [x] 3.4 `docs/spec/03-contrato-api.md` actualizado

## 4. Interfaz

- [x] 4.1 Contador `1/2` en «En curso», y solo ahí
- [x] 4.2 Color de peligro al alcanzar el límite
- [x] 4.3 Campo opcional en el diálogo de proyecto, con texto que explica la regla
- [x] 4.4 El mensaje del 409 llega del `detail` del servidor, que lleva el número

## 5. Validación

- [x] 5.1 9 pruebas de integración: sin límite, rechazo, crear en curso, editar dentro, liberar, retirar, 0 y negativo, resumen
- [x] 5.2 Prueba de concurrencia con dos peticiones a la vez
- [x] 5.3 **Verificado que la prueba de concurrencia falla al quitar el `FOR UPDATE`**
- [x] 5.4 E2E: se anuncia, se impone, se libera y sobrevive a la recarga
- [x] 5.5 Seed con un proyecto limitado, para que se vea al arrancar
- [x] 5.6 ADR-022 con la alternativa descartada

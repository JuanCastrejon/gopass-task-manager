# 05 — Estrategia de calidad

## 1. Principio

> No hacer afirmaciones de calidad que no se puedan medir de forma independiente.

"Funciona" no es evidencia. Un check verde reproducible sí.

## 2. Dónde se invierte el presupuesto de pruebas

El reparto no es doctrinal, es de retorno por hora dentro de un plazo de 20 horas:

| Tipo | Peso | Por qué |
|---|---|---|
| **Integración de API contra PostgreSQL real** | ~65 % | **117 pruebas**. Una sola prueba de `POST /projects → POST /tasks → PATCH status → GET` ejercita middleware, Zod, ruta, repositorio, SQL parametrizado y las restricciones reales del motor. Ningún otro tipo de prueba cubre tanto por línea escrita. |
| **Unitarias de lógica no trivial** | ~15 % | Solo el mapeo `SQLSTATE`→HTTP, el cálculo de avance y la regla de `completed_at`. No se prueban getters ni se simula `pg`: simular el driver prueba el simulador. |
| **Componentes de React** | ~10 % | **23 pruebas**. Los estados vacío, cargando y error de la vista de proyecto, con la API simulada a nivel de `fetch`, más las pruebas de filtros y tablero. |
| **E2E con Playwright** | ~10 % | **11 escenarios**. Desde el ciclo completo y conflicto de borrado hasta columnas configurables, límites de WIP, arrastre entre columnas y reordenación manual dentro de columnas (SL-15). |

### Aislamiento: una base por worker de Vitest

Vitest ejecuta los archivos de prueba en paralelo. Compartir una base entre workers produce fallos intermitentes imposibles de depurar, y serializar todo con `fileParallelism: false` desperdicia el paralelismo.

La solución es `gopass_tasks_test_<VITEST_POOL_ID>`: cada worker crea y migra su propia base. Hay un detalle que decide el diseño y que solo aparece al implementarlo:

> `src/db/pool.ts` crea el pool **al importarse**, leyendo `env.DATABASE_URL`. Si el entorno no apunta ya a la base del worker, la cadena de imports del archivo de prueba instancia el pool contra la base equivocada.

Se comprobó que un `setupFile` se ejecuta **antes** de que se evalúen los imports estáticos del archivo de prueba, así que basta con reescribir `process.env.DATABASE_URL` ahí. No hacen falta `vi.mock` con hoisting, ni inyectar el pool en `createApp()`, ni convertir el pool en perezoso. `globalSetup` no serviría: corre en otro proceso y no comparte entorno con los workers.

```
tests/setup/test-db.ts     ← crea la base del worker, migra, trunca, cierra el pool
tests/helpers/app.ts       ← instancia la app, importada dinámicamente
tests/integration/*.test.ts
tests/unit/*.test.ts
```

Detalles que importan:

- `CREATE DATABASE` no admite `IF NOT EXISTS`: se ejecuta y se trata el `42P04` como éxito.
- Las migraciones se aplican con la **API programática** de `node-pg-migrate`, no invocando el binario: mismo proceso, mismo `DATABASE_URL`, sin depender de que el CLI esté en el `PATH` del runner de CI.
- `TRUNCATE TABLE tasks, projects` antes de cada caso. **Sin `CASCADE`**, porque nombrar las dos tablas ya cubre la referencia; y sin `RESTART IDENTITY`, porque las claves primarias son `uuid`, no secuencias.
- `closePool()` en `afterAll`. Sin eso, los sockets del driver mantienen vivo el event loop y el proceso de Vitest queda colgado al terminar, en local y en CI.
- Local y CI solo definen `DATABASE_URL`. El usuario necesita permiso para crear bases.

### Contra Testcontainers

No se usa. Docker Compose ya levanta un PostgreSQL y las pruebas crean su propia base por worker sobre esa misma instancia. Testcontainers da portabilidad perfecta a cambio de tiempo de arranque y una dependencia más; con Compose ya en el proyecto, no compensa dentro del plazo.

### Los 4 escenarios E2E

1. **Ciclo completo**: crear proyecto → crear tarea → verla en «Por hacer» → moverla hasta «Completada» → **recargar la página** → sigue ahí y el avance marca `aria-valuenow="100"`.
2. **Conflicto de borrado**: crear un proyecto con una tarea → intentar eliminarlo → la interfaz muestra el mensaje del 409 con `role="alert"` → cancelar → el proyecto sigue existiendo.

El primero existe por la recarga: es lo único que ninguna prueba de integración puede demostrar, porque comprueba que lo que se ve viene de PostgreSQL y no del estado de React. El segundo, porque el 409 es la decisión de diseño más interesante del proyecto (ADR-003) y una prueba de API solo demuestra que el servidor responde 409, no que eso **llegue a los ojos del usuario**.

Ambos crean sus propios datos con un sufijo temporal en el nombre: el índice único es `lower(btrim(name))`, así que un nombre fijo devolvería 409 en la segunda ejecución. No dependen del seed.

**Escribirlos encontró dos defectos de accesibilidad reales**, no del test:

- Las tres columnas del tablero no tenían nombre accesible, así que `getByRole('region', …)` resolvía a tres elementos —y un lector de pantalla oía tres secciones indistinguibles con tres botones «Añadir» idénticos—. Ahora cada columna es una región con su nombre y cada botón dice a qué columna añade.
- «Editar» y «Eliminar» en la cabecera del proyecto eran ambiguos en una página que también tiene acciones sobre tareas. Ahora dicen «Editar proyecto» y «Eliminar proyecto».

Son bloqueantes en CI. Dos escenarios sobre chromium tardan menos de cinco segundos; si no fueran fiables para bloquear, tampoco lo serían para incluirlos.

## 3. Matriz de trazabilidad

Un requisito sin prueba no se considera entregado. Esta tabla se completa durante la implementación y se publica en el README.

| Req | Endpoint / componente | Prueba |
|---|---|---|
| RF-01 | `POST /api/projects` · `ProjectFormDialog` | ✅ `tests/integration/projects.test.ts` → crea, sin descripción, nombre en blanco → 400, >120 caracteres → 400, normaliza espacios, duplicado ignorando mayúsculas → 409 |
| RF-02 | `GET /api/projects` · `ProjectList` | ✅ lista vacía, proyecto sin tareas → `progress: 0` (no 1 ni null), progreso correcto con tareas, contadores como número y no como string |
| RF-03 | `GET /api/projects/:id` | ✅ 200 con resumen, 404 con uuid inexistente, 400 —no 500— con id que no es uuid |
| RF-04 | `PATCH /api/projects/:id` | ✅ parcial deja el otro campo intacto, `null` explícito borra la descripción, mueve `updated_at` y no `created_at`, body vacío → 400, inexistente → 404, choque de nombre → 409 |
| RF-05 | `DELETE /api/projects/:id` | ✅ 204 sin cuerpo, **409 con tareas y el proyecto sigue existiendo después**, 404 —y no 409— si no existe · E2E escenario 2 |
| RF-06 | `POST /api/projects/:projectId/tasks` | ✅ `tests/integration/tasks.test.ts` → 201 con los valores por defecto de la base, 404 `PROJECT_NOT_FOUND` si el proyecto no existe, título en blanco y >200 caracteres → 400 |
| RF-07 / RF-08 | esquema Zod + `ENUM` | ✅ estado fuera del enum → 400 antes de tocar la base; `completedAt` y las erratas de campo → 400 por `.strict()`; unitaria del `22P02` |
| RF-09 | `PATCH /api/tasks/:id` | ✅ ciclo completo del trigger desde HTTP: nace sin fecha, `DONE` la sella, editar sin tocar el estado no la mueve, reenviar `DONE` tampoco, salir la limpia, volver la re-sella con otra fecha · E2E escenario 1 · E2E escenarios 1 y 3 (arrastre directo de `TODO` a `DONE`, que sobrevive a la recarga) |
| RF-10 | `PATCH` / `DELETE /api/tasks/:id` | ✅ parcial deja el resto intacto, `null` borra la descripción, body vacío → 400, 404 en ambas, 204 sin cuerpo · reasignación de proyecto y su 404 |
| RF-11 | `GET /api/projects/:projectId/tasks` · `TaskBoard` | ✅ API: distingue proyecto sin tareas de proyecto inexistente, ordena por prioridad sin `CASE`, no mezcla tareas de otro proyecto · tablero implementado y verificado en navegador |
| Arrastre | `TaskCard` + `TaskBoard` (ADR-021) | E2E escenario 3: mover entre columnas y persistir · escenario 4: soltar fuera devuelve la tarjeta y no dispara petición |
| Orden manual (SL-15) | `TaskBoard` + `reorderTask` (ADR-025) | ✅ `tests/integration/tasks.test.ts` (reordenación, cálculo fraccionario, 60 inserciones en el mismo hueco, convivencia con ADR-024) · E2E escenarios 10 y 11 (`orden-manual-de-tareas.spec.ts`: persistencia tras recarga y bloqueo con aviso visible en columnas automáticas) |
| RF-12 | `GET /api/stats` · `StatsPanel` | ✅ `tests/integration/stats.test.ts` → sin datos devuelve ceros con todas las claves presentes, agregados correctos, reparto por estado y prioridad, números y no los `bigint` como string |
| RF-13 | filtros en `GET .../tasks` | ✅ **entró en SL-05** → estado y prioridad repetibles, combinación de ambos, `q` con `ILIKE` insensible a mayúsculas, valores repetidos deduplicados, sin coincidencias → `[]` y no 404, valor fuera del enum → 400, filtro vacío → 400 |
| RF-15 | `GET /api/health` | integración: 200 y campo de estado de la base |
| RF-16 | `api/src/db/seed.ts` | integración: carga 4 proyectos y 11 tareas, sembrar dos veces no inserta nada, no revierte un cambio hecho a mano, y ninguna tarea nace con `completed_at` escrito por el seed |
| RNF-04 | `error-handler.ts` · `pg-error.ts` | ✅ 12 unitarias del mapeo `SQLSTATE`; integración: ninguna respuesta filtra `constraint`, `Key (` ni `stack`; `requestId` en toda respuesta; ruta inexistente en `problem+json` |
| RNF-07 | `States.tsx` en cada vista | ✅ esqueleto con la forma del contenido, `EmptyState` con acción principal, `ErrorState` con reintento. **El panel de métricas ya no se queda en esqueleto animado cuando falla**, y las mutaciones del tablero muestran su error con `role="alert"` · 7 unitarias en `error-messages.test.ts` |
| RNF-08 | responsive y teclado | 🔨 verificado a 375 px: el tablero se desplaza en horizontal con anclaje y la siguiente columna asoma; el `body` no desborda. `<dialog>` nativo con trampa de foco y `Escape`; la tarjeta movida recupera el foco al cambiar de columna |

### Auditoría adversarial previa a la entrega

En vez de «repasar la interfaz», se pidió a dos revisores hostiles que **predijeran qué estaba roto** sin ver el código, solo con la arquitectura descrita. Ocho de sus apuestas resultaron ciertas y se reprodujeron una por una antes de tocar nada:

| Defecto | Cómo se comprobó | Estado |
|---|---|---|
| Nueve `<dialog>` en el documento con `id` repetidos | `document.querySelectorAll('dialog').length` → 9; cinco `<label for="project-name">` resolviendo **al mismo input** | ✅ diálogos montados solo al abrirse, `useId()` en el modal |
| Un temporizador de búsqueda rancio borraba el filtro de prioridad | Teclear y pulsar el chip antes de 250 ms: la URL pasaba de `?q=contrato&priority=HIGH` a `?q=contratos` | ✅ los parámetros se leen de `window.location` dentro del temporizador |
| El buscador no se sincronizaba con la URL al llegar de fuera | Revisión de código: `useState(busquedaUrl)` solo inicializa | ✅ efecto de sincronización |
| Borrar una tarea: sin confirmar, sin estado de envío y sin mostrar el fallo | Revisión de código: `borrar.mutate(id)` suelto | ✅ confirmación nativa, guarda de reentrada y `role="alert"` |
| El panel de métricas se congelaba en esqueleto animado al fallar | `isPending \|\| isError` devolvía el mismo esqueleto | ✅ mensaje explícito |
| Un 502/504 de nginx reventaba con `SyntaxError` fuera del `try` | Con la API parada, nginx devuelve **504 con `text/html`** | ✅ parseo protegido; se convierte en `ApiError(504)` |
| Doble clic rápido creaba dos recursos y un 409 desconcertante | `isPending` tarda un ciclo de render en deshabilitar el botón | ✅ guarda síncrona en el manejador |
| El foco caía al `body` al cambiar de vista | Navegación solo con teclado | ✅ el contenedor principal recibe el foco |

Los tres revisores coincidieron además en **qué no tocar** a seis horas del envío: no cambiar el enrutador propio por una librería, no introducir mutaciones optimistas con rollback, y no sustituir el `<dialog>` nativo. Ninguna de las tres se tocó.

## 4. Quality gates

`sdlc adopt` deja `quality-contract.yaml` con `enforcement: observe`, `surfaces: []` y tres probes que apuntan a scripts de `package.json`. La configuración para este proyecto:

```yaml
enforcement: observe          # ADR del framework: ningún control nace en `block`

surfaces:                     # se declaran en .sdlc/config.json, no aquí a mano
  - api/src
  - web/src

probes:
  - id: coverage
    command: validate:coverage      # → vitest run --coverage
    emits: coverage/coverage-summary.json

  - id: deps
    unavailable:
      reason: >
        Sin dependency-cruiser configurado. Montarlo es un slice propio,
        no un ajuste dentro del plazo de esta entrega.

  - id: mutation
    unavailable:
      reason: >
        Sin runner de mutación. Stryker sobre este alcance excede el
        presupuesto de tiempo de la prueba.
```

### La forma de `surfaces` no es una lista de rutas

`.sdlc/config.json` exige objetos `{ id, path, owner, tier }`, no cadenas. Con cadenas, el motor resuelve `path` a `undefined` y falla con `The "path" argument must be of type string`. Declararlas bien es además lo que hace que los umbrales por tier signifiquen algo:

```json
"surfaces": [
  { "id": "api", "path": "api/src", "owner": "Juan Castrejon", "tier": "core" },
  { "id": "web", "path": "web/src", "owner": "Juan Castrejon", "tier": "shell" }
]
```

`api/src` es `core` —ahí viven la integridad y la máquina de estados— y `web/src` es `shell`. El gate de líneas cambiadas resuelve entonces `thresholds.core = 90`.

### El probe encadena las dos herramientas

El adapter `istanbul-summary` lee dos cosas del mismo archivo: `total`, que escribe el reporter de cobertura, y `changed`, que **añade `sdlc coverage-diff`**. Si el probe solo ejecutara las pruebas, sobrescribiría el resumen y borraría `changed`. Por eso:

```json
"validate:coverage": "npm --prefix api run test:coverage && sdlc coverage-diff"
```

Y por eso el reporter de Vitest emite a `../coverage` con el formato `json` además del resumen: `coverage-diff` necesita el `coverage-final.json` detallado para cruzarlo con el `git diff`, y el `emits` del contrato se resuelve desde la raíz del repositorio, no desde `api/`.

### Qué dice el gate hoy, y por qué eso es lo correcto

Sobre un cambio que **sí** toca `api/src`, mide de verdad:

```
$ sdlc coverage-diff --base-ref 9edc7e5~1
{ "changed_lines_total": 202, "changed_lines_covered": 200, "changed_lines_pct": 99.01 }
```

Sobre un cambio que solo toca el frontend o la documentación, el gate sale **`vacuous`** con el motivo escrito —«denominador por debajo del mínimo: `changed_lines_total=0 < 1`»— en vez de dar un verde que no ha medido nada. Es exactamente el comportamiento que se quiere: un gate que finge aprobar lo que no midió enseña a ignorar la señal.

Esto último es deliberado y es el mejor argumento del enfoque: al declarar un probe como `unavailable` **con motivo escrito**, los gates que dependen de él salen `not-applicable`, no `not-measured`.

> **NO MEDIDO** e **INCUMPLIDO** no son lo mismo. Un check rojo permanente que no los distingue enseña al equipo a ignorar la señal. Y bajar el umbral para que el check pase es teatro, no ingeniería.

Ese párrafo es la respuesta cuando pregunten por qué hay un contrato de calidad con la mitad de los controles apagados.

## 5. Pipeline de CI

`.github/workflows/ci.yml`, con un servicio de PostgreSQL:

```
instalar      →  npm ci  ×3  (raíz, api, web: tres lockfiles, tres cachés)
lint          →  eslint  (api: src + tests con tipos · web: src + react-hooks)
typecheck     →  tsc --noEmit  (api y web)
test:api      →  vitest run --coverage  contra el servicio postgres:16 en 5433
test:web      →  vitest run
build         →  tsc + vite build
e2e           →  playwright test  (chromium, 11 escenarios, bloqueante)
quality-gate  →  sdlc quality-gate --slice ci --phase F8 --run --json
```

Un solo job secuencial. Paralelizarlo pagaría tres veces el `checkout`, el
`setup-node` y las tres instalaciones para ahorrar unos segundos en un
pipeline que ya cabe de sobra en el objetivo.

Detalles que se descubrieron al montarlo, no leyendo documentación:

- **PostgreSQL en `5433:5432`**, igual que en Compose. El runner de GitHub trae
  su propio PostgreSQL y el 5432 es un puerto en disputa.
- **`fetch-depth: 0`** en el checkout. `coverage-diff` compara contra `HEAD~1`
  y con el clon superficial por defecto ese commit no existe en el runner.
- **`sdlc` es una `devDependency`**, no una instalación global del autor: la
  añadió `adopt` y hay binario en `node_modules/.bin`, así que `npx sdlc`
  funciona en un runner limpio.
- **Los adapters de formato hay que copiarlos a `scripts/quality-adapters/`.**
  El motor no los trae embebidos: los busca en disco. Sin ellos el gate falla
  con `The "path" argument must be of type string`.

Objetivo: menos de 3 minutos. Un CI lento no se mira; un CI verde visible en el repositorio se mira antes de clonar.

`sdlc quality-gate --run` cierra el pipeline porque cumple el papel de árbitro independiente: el agente que implementó no es quien declara que el resultado es correcto.

### Por qué `quality-gate` y no `verdict`

Se probó `sdlc verdict` sobre este repositorio y devuelve:

```json
{ "status": "not-configured", "verdict": "NOT-VERIFIABLE",
  "vacuousReason": "ningun paso del veredicto esta declarado en package.json",
  "notConfigured": ["control-plane","drift","slice-traceability","surface-traceability",
                    "semantic-guardrails","adr-integrity","openspec","active-slices"] }
```

`verdict` está pensado para consumidores del harness completo: espera los ocho validadores que instala `sdlc init`, y este proyecto usa deliberadamente solo `adopt`. Un paso de CI que siempre sale `NOT-VERIFIABLE` es ruido, no una puerta.

Lo mismo aplica a `sdlc governance-check`, que exige `AGENTS.md`, `CLAUDE.md` y `.github/AGENTS.md`. Ninguno de los dos entra en el pipeline.

`quality-gate --run`, en cambio, sí funciona con la huella de `adopt`: lee `quality-contract.yaml`, ejecuta los probes declarados y adjudica. Sin pruebas todavía devuelve `not-measured`, que es la respuesta correcta y no un falso verde.

Esto es un ejemplo de la propia regla del proyecto: se comprobó ejecutándolo, no se asumió porque el comando existiera.

## 6. Definición de terminado

Una funcionalidad está terminada cuando:

1. El endpoint responde el caso feliz **y** sus casos de error, y ambos tienen prueba.
2. La interfaz maneja vacío, cargando y error.
3. Las restricciones correspondientes existen en la migración.
4. El requisito aparece en la matriz de trazabilidad con su prueba.
5. `docker compose down -v && docker compose up --build` sigue funcionando desde cero.

El punto 5 se ejecuta al menos tres veces: al cerrar el día 1, en el feature freeze, y antes de enviar el correo.

## 7. Cobertura

Objetivo: **≥ 70 % de líneas del backend funcional**, excluyendo `server.ts`, `config/` y archivos de arranque. No se persigue cobertura global ni se cuenta el frontend en la misma métrica: inflar el denominador con archivos triviales convierte el número en decorativo.

La métrica que de verdad importa: **el 100 % de los caminos de error del catálogo de códigos de `03-contrato-api.md` tiene una prueba que lo provoca de verdad** —violando la restricción real, no simulando el driver.

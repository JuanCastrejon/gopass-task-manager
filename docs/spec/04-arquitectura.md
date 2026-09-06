# 04 — Arquitectura y decisiones

## 1. Vista general

```
┌─────────────────────────────────────────────────────────┐
│  web/   React 18 + Vite + TypeScript + TanStack Query   │
│                                                         │
│  Validación de formularios  →  experiencia de usuario   │
└───────────────────────────┬─────────────────────────────┘
                            │  HTTP / JSON
                            ▼
┌─────────────────────────────────────────────────────────┐
│  api/   Node + Express + TypeScript                     │
│                                                         │
│  routes       → HTTP, nada más                          │
│  schemas      → Zod. FRONTERA DE CONFIANZA              │
│  controllers  → traducción HTTP ↔ dominio               │
│  services     → reglas de negocio, transacciones        │
│  repositories → SQL parametrizado, mapeo de filas       │
│  middleware   → errores, requestId, CORS                │
└───────────────────────────┬─────────────────────────────┘
                            │  pg (pool)
                            ▼
┌─────────────────────────────────────────────────────────┐
│  PostgreSQL 16                                          │
│                                                         │
│  FK · NOT NULL · CHECK · ENUM · UNIQUE · índices        │
│  INTEGRIDAD. La última palabra.                         │
└─────────────────────────────────────────────────────────┘
```

Las tres capas validan cosas distintas y esto es lo que se responde cuando pregunten "¿dónde validas?":

| Capa | Qué valida | Si falla |
|---|---|---|
| React | Que el formulario esté completo antes de molestar al servidor | Mensaje inline, no se envía |
| Express + Zod | Forma, tipo y rango del payload. **Es la frontera de confianza** | 400 `VALIDATION_ERROR` |
| PostgreSQL | Integridad referencial e invariantes del dominio | `SQLSTATE` traducido a 409 / 404 / 400 |

La frontend puede ser saltada con `curl`. La API no. La base tampoco.

## 2. Estructura de carpetas

```
gopass-task-manager/
│
├── api/
│   ├── src/
│   │   ├── modules/
│   │   │   ├── projects/
│   │   │   │   ├── projects.routes.ts
│   │   │   │   ├── projects.controller.ts
│   │   │   │   ├── projects.repository.ts
│   │   │   │   ├── projects.schema.ts
│   │   │   │   └── projects.mapper.ts
│   │   │   ├── tasks/           (misma forma)
│   │   │   └── stats/
│   │   ├── db/
│   │   │   ├── pool.ts
│   │   │   └── pg-error.ts       ← mapeo SQLSTATE → error de dominio
│   │   ├── http/
│   │   │   ├── errors.ts          ← AppError + catálogo de códigos
│   │   │   ├── error-handler.ts   ← middleware central, RFC 7807
│   │   │   ├── request-id.ts
│   │   │   └── validate.ts        ← middleware genérico de Zod
│   │   ├── config/env.ts          ← env validado con Zod al arrancar
│   │   ├── app.ts
│   │   └── server.ts
│   ├── migrations/
│   │   └── 0001_init.sql
│   ├── seeds/seed.ts
│   └── tests/
│       ├── integration/           ← Supertest contra PostgreSQL real
│       └── unit/                  ← solo lógica no trivial
│
├── web/
│   ├── src/
│   │   ├── features/
│   │   │   ├── projects/          ← componentes + hooks de query
│   │   │   ├── tasks/
│   │   │   └── dashboard/
│   │   ├── components/ui/         ← Button, Dialog, Badge, EmptyState…
│   │   ├── lib/
│   │   │   ├── api-client.ts      ← fetch tipado + parseo de problem+json
│   │   │   └── query-client.ts
│   │   ├── types/api.ts
│   │   └── App.tsx
│   └── tests/
│
├── docs/
│   ├── decisions.md               ← ADRs (se promueve desde este documento)
│   ├── data-model.md
│   ├── api.md  +  openapi.yaml
│   └── process/ai-assisted-development.md
│
├── .github/workflows/ci.yml
├── docker-compose.yml
├── quality-contract.yaml          ← sdlc adopt
├── phase-contract.yaml            ← sdlc adopt
├── .sdlc/config.json              ← sdlc adopt
└── README.md
```

Dos carpetas de aplicación, sin Turborepo ni workspaces de pnpm. Un monorepo con herramientas de monorepo para dos paquetes es coste de configuración sin beneficio; se paga en depuración de symlinks lo que se pretendía ahorrar en scripts.

### Por qué módulo por dominio y no capa por dominio

La alternativa (`controllers/`, `services/`, `repositories/` en la raíz, con todos los dominios mezclados dentro) obliga a abrir tres carpetas para entender una funcionalidad. Con `modules/projects/` todo lo de proyectos está junto, y el día que un módulo crezca lo suficiente para extraerlo, se mueve una carpeta. Es la misma organización que usa un monolito modular real.

## 3. Registro de decisiones (ADR)

### ADR-001 — Monolito modular, no microservicios

**Contexto.** Dos entidades, un consumidor, un despliegue.
**Decisión.** Una sola aplicación de backend con módulos separados por dominio.
**Consecuencia.** Se conserva la separación de responsabilidades sin pagar red, descubrimiento de servicios, consistencia eventual ni observabilidad distribuida.
**Frase de defensa.** *"Distribuir el sistema habría añadido complejidad operativa sin resolver ningún problema real del dominio. Los módulos ya están separados; extraer uno el día que lo justifique un requisito de escala o de equipo es mover una carpeta."*

### ADR-002 — `pg` con patrón repositorio, sin ORM

**Contexto.** El enunciado exige PostgreSQL explícitamente. El dominio tiene dos tablas y menos de quince consultas.
**Decisión.** Driver `pg` con consultas parametrizadas encapsuladas en repositorios. Migraciones con `node-pg-migrate`.
**Alternativas.** Prisma acelera un CRUD grande y da tipos generados, pero introduce una capa de abstracción que hay que explicar y esconde justo lo que la prueba quiere ver. TypeORM encaja con NestJS, no con Express plano. Drizzle es una alternativa razonable, pero adoptar una herramienta nueva durante una prueba con plazo es riesgo sin retorno.
**Consecuencia.** El SQL, las restricciones y los índices son visibles y auditables en el repositorio. El coste es escribir a mano el mapeo fila→objeto, que vive en un único `mapper` por módulo.
**Frase de defensa.** *"Con dos entidades, un ORM añade una abstracción que hay que justificar y que oculta el SQL. El patrón repositorio me da el mismo aislamiento: si mañana el volumen justifica un ORM, entra detrás de esa interfaz sin tocar controladores ni servicios."*

### ADR-003 — Borrar un proyecto con tareas devuelve 409, no cascada

**Contexto.** Tres opciones: impedir (409), borrar en cascada, o desvincular (`project_id NULL`).
**Decisión.** `ON DELETE RESTRICT` en la clave foránea y 409 `PROJECT_HAS_TASKS` en la API.
**Alternativas.** La cascada destruye trabajo con un solo clic y sin intención explícita. Desvincular contradice el modelo: una tarea sin proyecto no tiene sentido en este dominio; obligaría a que `project_id` fuera nullable y a que toda la interfaz manejara "tareas huérfanas".
**Consecuencia.** La interfaz debe explicar el conflicto, no mostrar un error genérico.
**Frase de defensa.** *"Prefiero un borrado que falla de forma explicable a uno que destruye información en silencio. Si el negocio pidiera cascada, la habilitaría con confirmación explícita del usuario, no por defecto en el esquema."*

### ADR-004 — La integridad se verifica en el motor, no en memoria

**Contexto.** Comprobar "¿tiene tareas?" con un `SELECT` antes del `DELETE` deja una ventana entre ambas sentencias.
**Decisión.** Se ejecuta la operación y se traduce el `SQLSTATE` que devuelve PostgreSQL.
**Consecuencia.** Existe un módulo `db/pg-error.ts` que traduce los códigos identificables por sí solos (`23505`, `23514`, `22P02`, `23502`) leyendo el nombre de la restricción.
**Matiz descubierto al medirlo.** `23503` **no** se traduce ahí. Se comprobó contra PostgreSQL 16 que borrar un proyecto con tareas e insertar una tarea con `project_id` inexistente producen los mismos `code`, `constraint`, `table`, `schema` y `routine`; solo difiere `detail`, texto en inglés del motor. Como esos dos casos deben responder 409 y 404, la desambiguación vive en cada repositorio, que sí sabe qué operación ejecutaba. `translatePgError()` devuelve `null` para `23503` a propósito, y una prueba unitaria fija esa decisión. Detalle en [08-verificacion-postgres.md](08-verificacion-postgres.md) §6.
**Frase de defensa.** *"Validar en memoria lo que la base ya garantiza es una condición de carrera con pasos extra. La restricción es atómica; mi trabajo es traducir su error a un HTTP correcto."*

### ADR-005 — TanStack Query como estado de servidor; sin Redux

**Contexto.** Todo el estado relevante de esta aplicación vive en el servidor.
**Decisión.** TanStack Query para consultas, mutaciones e invalidación. `useState` local para lo que es genuinamente de interfaz (modal abierto, filtro seleccionado).
**Alternativas.** Redux introduce un almacén global para datos que ya tienen una fuente de verdad remota, y obliga a escribir a mano caché, reintentos y estados de carga. `useEffect` + `fetch` es la versión artesanal del mismo problema, con condiciones de carrera de regalo.
**Consecuencia.** Tras cada mutación se invalida la query afectada. Sin actualizaciones optimistas: la interfaz nunca muestra un estado que la base rechazó.
**Frase de defensa.** *"El estado de servidor y el estado de interfaz son problemas distintos. Meter datos remotos en Redux es reimplementar una caché que ya existe resuelta."*

### ADR-006 — Tailwind CSS

**Contexto.** El enunciado pide "visualizar la información de forma útil" y el evaluador ve la interfaz antes que el código.
**Decisión.** Tailwind con una escala de color semántica propia para estados y prioridades.
**Consecuencia.** El riesgo de Tailwind es que la interfaz parezca una plantilla. Se mitiga definiendo primero los tokens (color por estado, color por prioridad, espaciado) y componiendo componentes propios, no pegando utilidades sueltas por todo el árbol.

### ADR-007 — El harness de calidad entra por `sdlc adopt`, no por `init`

**Contexto.** El autor de este proyecto mantiene `sistema-multiagente-sdlc`, publicado en npm bajo licencia MIT. El modo `init --greenfield` instala 286 archivos de gobernanza.
**Decisión.** Se usa `sdlc adopt`, que es puramente aditivo: `.sdlc/config.json`, `quality-contract.yaml`, `phase-contract.yaml`, `schemas/phase-evidence.schema.json` y una `devDependency`. Cuatro archivos.
**Consecuencia.** El repositorio sigue siendo, ante todo, la aplicación. El contrato de calidad se ejecuta como un paso más de CI (`sdlc quality-gate --run`), no como una ceremonia paralela. Se descartaron `verdict` y `governance-check` tras ejecutarlos: ambos esperan artefactos que solo instala el harness completo. El razonamiento medido está en [05-estrategia-calidad.md](05-estrategia-calidad.md) §5.
**Qué NO se hace.** No se instalan las fases F0–F17, ni los agentes, ni los espejos de skills, ni OpenSpec. Meter el andamiaje completo en una prueba de dos entidades sería exactamente el error que el enunciado castiga.
**Se menciona en el README, en una línea.** No en la portada ni como argumento de seniority, sino en la sección de decisiones técnicas. Razón: `quality-contract.yaml`, `phase-contract.yaml`, `.sdlc/config.json` y el paso de quality gate en CI van a estar visibles en el repositorio de todas formas. Si el README no los explica, el evaluador ve artefactos sin contexto y la lectura por defecto es "plantilla copiada" o "sobrecarga sin justificar". Y como la entrega es por correo, puede no haber una entrevista donde aclararlo. Texto exacto:

> `- **Proceso asistido por IA.** Se usó `sistema-multiagente-sdlc` (herramienta propia, MIT en npm) para los contratos de calidad y la verificación en CI. La aplicación no depende de él en tiempo de ejecución. Detalle en [docs/process/ai-assisted-development.md](../process/ai-assisted-development.md).`

**Frase de defensa.** *"El framework aquí gobierna la evidencia, no la arquitectura de la aplicación. La aplicación no depende de él en tiempo de ejecución: si se quita la devDependency, el producto sigue funcionando igual."*

### ADR-008 — Docker Compose como contrato de arranque

**Contexto.** El evaluador va a ejecutar esto en una máquina que no controlamos.
**Decisión.** `docker compose up --build` levanta PostgreSQL, espera a que esté sano, aplica migraciones, siembra datos y sirve API y web.
**Detalles que no son opcionales.**
- `healthcheck` con `pg_isready` en el servicio de base de datos, y `depends_on: { condition: service_healthy }` en la API. Sin esto, la API arranca antes que PostgreSQL y falla de forma intermitente.
- PostgreSQL publicado en `5433:5432`. El 5432 del evaluador probablemente ya está ocupado.
- Migraciones idempotentes ejecutadas en el arranque de la API, no en un paso manual del README.
- Vite con `server.proxy` hacia la API para que la ruta `/api` funcione igual en desarrollo local y dentro de Compose, sin configurar CORS por ambiente ni exponer la URL del backend en el bundle.

### ADR-009 — La base sella `completed_at`; el `CHECK` lo verifica

**Contexto.** La invariante `status = 'DONE' ⟺ completed_at IS NOT NULL` está protegida por un `CHECK`, pero alguien tiene que escribir el valor.
**Decisión.** Un trigger `BEFORE INSERT OR UPDATE OF status` en `tasks`. La aplicación nunca escribe `completed_at`.
**Alternativas.** Sellarlo en el servicio deja fuera al seed, a `psql` y a cualquier migración de datos: esas escrituras violarían el `CHECK` y devolverían un 500 en vez de un dato correcto. Una columna generada no sirve: requiere una función `IMMUTABLE` y `now()` no lo es, además de que una generada no puede representar una transición.
**Consecuencia.** El seed no menciona `completed_at` en ninguna parte y sus tareas `DONE` lo tienen. Es la demostración de que la invariante no depende de que la aplicación acierte.
**Frase de defensa.** *"El `CHECK` verifica la invariante y el trigger la satisface. Separo las dos cosas: la primera es una garantía, la segunda es cómo se cumple. Puse ambas en el motor porque la API no es la única vía de escritura."*

### ADR-010 — El `requestId` lo genera siempre el servidor

**Contexto.** Hace falta correlacionar la respuesta que ve el cliente con la línea de log del servidor.
**Decisión.** `crypto.randomUUID()` en un middleware, devuelto en la cabecera `X-Request-Id` de **todas** las respuestas y en el cuerpo de todo error. No se acepta un `X-Request-Id` entrante. No se usa `AsyncLocalStorage`.
**Alternativas.** Aceptar el identificador del cliente permite encadenar trazas con un proxy por delante, pero aquí no hay ninguno poniéndolo, y reflejar una cabecera del cliente en la respuesta y en el log obliga a validar formato, longitud y caracteres de control para no permitir inyección de líneas en el log. `AsyncLocalStorage` evitaría pasar el identificador por parámetro, pero hoy solo lo necesita el manejador de errores, que ya tiene `req`.
**Consecuencia.** Devolverlo también en las respuestas correctas, y no solo en los 500, permite investigar el caso en que un 200 devolvió algo inesperado.

### ADR-011 — Sin capa de servicio mientras no tenga nada que hacer

**Contexto.** La estructura prevista era `routes / controller / service / repository / schema / mapper` por módulo.
**Decisión.** Al escribir el módulo de proyectos, el servicio quedaba vacío: no hay orquestación entre repositorios, ni transacción de varios pasos, ni regla de negocio que no esté ya en el esquema Zod o en el motor. Se eliminó. Quedan `routes` (HTTP y validación), `repository` (SQL y traducción de errores), `schema` y `mapper`.
**Alternativas.** Mantenerlo por convención. Se descartó: una capa que solo reenvía la llamada se replica como norma y encarece cualquier cambio pequeño sin aportar aislamiento real.
**Consecuencia.** Entrará en cuanto exista algo que orquestar —una operación que toque dos repositorios en una transacción, por ejemplo—. Añadirlo entonces es mover código; tenerlo vacío desde el principio es ceremonia.
**Frase de defensa.** *"La especificación contemplaba un servicio. Al implementarlo no tenía nada que hacer, así que lo quité y lo dejé escrito. Prefiero borrar una capa vacía a defenderla en una entrevista."*

### ADR-012 — El `PATCH` compone el `SET`, no usa `COALESCE`

**Contexto.** `PATCH /api/projects/:id` acepta campos opcionales.
**Decisión.** Se compone la lista de asignaciones a partir de las claves presentes, tomando el nombre de columna de un mapa constante del propio módulo.
**Alternativas.** `SET name = COALESCE($2, name)` evita componer la sentencia, pero hace **imposible borrar una descripción ya escrita**: con `COALESCE`, `null` significa "no lo toques" y no queda forma de expresar "déjalo vacío". Leer, fundir en memoria y reescribir añade un viaje y una carrera entre ambos.
**Consecuencia.** Un campo ausente significa "no lo cambies" y un `null` explícito significa "bórralo", que es la semántica que espera cualquiera que use un `PATCH`. El nombre de la columna nunca sale del payload, así que no hay superficie de inyección aunque el SQL se componga.

### ADR-013 — Enrutado propio sobre la History API, sin librería

**Contexto.** El detalle de un proyecto tiene que ser direccionable: debe sobrevivir a una recarga y poder compartirse. Un `useState` con el nombre de la pantalla no sirve.
**Decisión.** Unas 35 líneas con `history.pushState`, un escuchador de `popstate` y `useSyncExternalStore`. Dos rutas: `/` y `/projects/:id`.
**Alternativa medida.** Se instaló `react-router-dom` v7 y se midió su coste real en este bundle: **+38 KB sin comprimir, +13.4 KB gzip**, un 22 % más, para dos rutas. (De paso: la cifra de "~300 KB" que circula es falsa.)
**Consecuencia.** No se pierde nada de lo que importa: los enlaces son `<a href>` reales, así que funcionan el botón de atrás, «abrir en pestaña nueva», el clic central y `Ctrl`/`Cmd`+clic; `preventDefault` solo se aplica al clic izquierdo sin modificadores. `nginx` y Vite ya tienen el fallback de SPA. Se usa `useSyncExternalStore` y no `useState` + `useEffect` porque es la forma que React 18 tiene de leer una fuente externa —`window.location`— sin desgarros en un render concurrente.
**Cuándo entraría la librería.** Rutas anidadas, cargadores de datos por ruta, navegación con bloqueo o transiciones. Nada de eso existe aquí.
**Frase de defensa.** *"Medí lo que costaba: 13 KB gzip para dos rutas. Con la History API son treinta líneas y el detalle sigue siendo una URL compartible. La librería entra cuando haya rutas anidadas o cargadores por ruta."*

### ADR-014 — El `<dialog>` nativo en lugar de una librería de modales

**Contexto.** Hacen falta modales para alta, edición y confirmación de borrado. Un modal accesible necesita trampa de foco, cierre con `Escape`, fondo inerte y devolución del foco al disparador.
**Decisión.** El elemento nativo `<dialog>` con `showModal()`.
**Alternativas.** `@radix-ui/react-dialog` es excelente, pero aquí no compra nada que el navegador no traiga ya. Un modal propio con `createPortal` costaría el triple y saldría peor.
**Consecuencia.** Hay tres cosas que sí hay que añadir a mano, y están comentadas en el componente: sincronizar `open` con el ciclo de vida de React, cancelar el `Escape` nativo para que el cierre pase por `onClose` —si no, el diálogo se cierra y el estado de React sigue creyéndolo abierto—, y enfocar el primer campo. Esto último **no** funciona con el `autoFocus` de React: React lo aplica al montar el elemento, cuando el diálogo todavía no se ha mostrado, y `showModal()` vuelve a decidir el foco después. Se marca el destino con `data-autofocus` y se enfoca tras abrir.

### ADR-015 — Esquemas de escritura estrictos

**Contexto.** `completed_at` lo sella la base y la aplicación no lo escribe nunca. ¿Qué pasa si un cliente manda `{"status":"DONE","completedAt":"2020-01-01"}`?
**Decisión.** `.strict()` en todos los esquemas de `POST` y `PATCH`: una clave desconocida devuelve 400 señalando el campo. No se aplica a `params` ni a `query`, donde las claves de más las pone el enrutador y no el cliente.
**Alternativas.** El comportamiento por defecto de Zod es **descartar en silencio** las claves desconocidas, así que ese cliente recibiría un 200 y creería que guardó la fecha. Aceptar el campo y dejar que el trigger lo pise es aún peor: la respuesta contendría un valor distinto del enviado sin explicación.
**Consecuencia.** Un cliente que mande campos de más se rompe. Es una rotura correcta y visible. De propina, atrapa las erratas: `{"staus":"DONE"}` deja de ser un parche vacío silencioso y pasa a ser un 400 que dice qué pasa.

### ADR-016 — Listar tareas y comprobar el proyecto en una sola consulta

**Contexto.** `GET /api/projects/<uuid-inexistente>/tasks` con la consulta directa devolvería `[]` con 200. Eso miente: el cliente creería que el proyecto existe y está vacío, y sería incoherente con el `POST`, que sí da 404.
**Decisión.** Una sola sentencia anclada en `projects` con `LEFT JOIN tasks`, y **los filtros en la condición del `JOIN`, no en el `WHERE`**.
**Por qué ahí y no en el `WHERE`.** En el `WHERE`, un filtro que no case ninguna tarea eliminaría también la fila del proyecto y un proyecto existente sin coincidencias se convertiría en un 404 falso. Verificado contra el motor.
**Consecuencia.** La lectura queda atómica —sin el `SELECT` de comprobación seguido del listado, que serían dos viajes con una ventana entre ellos— y el repositorio distingue los tres casos por el número de filas: `0` → el proyecto no existe; `1` con `t.id` nulo → existe y no tiene tareas; `n` → sus tareas. Esa fila fantasma hay que filtrarla antes de mapear, o el endpoint devolvería un objeto con todos los campos en `null`.

### ADR-017 — Reasignar una tarea a otro proyecto

**Contexto.** El enunciado no lo pide. Pero el 409 de borrado dice que hay que eliminar o mover las tareas primero, y sin esta operación esa frase sería una promesa que la API no puede cumplir.
**Decisión.** `projectId` entra en el `PATCH` de tarea. Cuesta una entrada en el mapa de columnas escribibles y una rama en el `catch`, y reutiliza la traducción del `23503` que ya existía.
**Consecuencia.** El mismo código de PostgreSQL se traduce ahora en **tres** sitios distintos según la operación: al borrar un proyecto es 409 `PROJECT_HAS_TASKS`; al crear una tarea es 404 del proyecto padre; al mover una tarea es 404 del proyecto destino. Es la demostración más clara de por qué la desambiguación no puede vivir en un traductor genérico (ADR-004).
**El texto de la interfaz se corrigió, no el revés.** El mensaje del diálogo dice ahora solo «elimínalas», porque la interfaz todavía no expone un control para mover. Prometerlo ahí mandaría al usuario a buscar un botón que no existe.

### ADR-018 — Flechas de transición, no un desplegable de estado

> **Revisado por ADR-020 y ADR-021.** El tamaño de estos botones se corrigió tras medirlo en un
> móvil, y el arrastre acabó entrando cuando quedó claro que un retardo de activación lo separa del
> gesto de desplazar. Las flechas no se sustituyeron: son la alternativa de un solo puntero que
> exige WCAG 2.5.7, y lo que este ADR decidió sobre ellas sigue vigente.


**Contexto.** El tablero necesita una forma de mover una tarjeta entre columnas. El drag & drop está descartado por coste y accesibilidad.
**Decisión.** Dos botones de flecha en el pie de la tarjeta, habilitados solo para las transiciones válidas: `TODO` solo avanza, `DONE` solo retrocede, `IN_PROGRESS` va en ambos sentidos.
**Alternativa.** Un `<select>` de estado en cada tarjeta. Se descarta porque **la columna ya dice cuál es el estado actual**: repetirlo en un desplegable es información redundante ocupando el ancho de una tarjeta estrecha. Lo que no es redundante es la *transición*, y eso es justo lo que comunica una flecha, en un solo clic y sin abrir nada encima.
**Accesibilidad.** Son `<button>` nativos con `aria-label` que nombra la tarea y el destino («Mover "Homologar lectores TAG" a En curso»).
**Detalle que nadie ve hasta que navega con teclado.** Al moverse, la tarjeta se desmonta de una columna y se monta en otra: el botón que tenía el foco desaparece y el foco caería al `body`. La tarjeta recién movida se enfoca a sí misma al montarse para que quien usa teclado no pierda el punto de referencia.

### ADR-022 — Límite de trabajo en curso, impuesto por el motor y no por la interfaz

> **Revisado por ADR-023.** El límite dejó de vivir en el proyecto y bajó a la columna al llegar
> las columnas configurables: «Desarrollo» máximo 3 y «QA» máximo 2 es una política real que un
> único límite por proyecto no puede expresar. Todo lo que este ADR decide sobre la concurrencia y
> el bloqueo sigue vigente; solo cambia la fila que se bloquea.

**Contexto.** El tablero tenía tres columnas y ninguna regla de flujo. Un tablero sin límite de
trabajo en curso dibuja columnas pero no gestiona nada: el límite es la idea central del método
kanban, y lo que hace visible el cuello de botella antes de que el trabajo se acumule.

**Decisión.** `projects.wip_limit integer NULL`, aplicado **solo a `IN_PROGRESS`**, con la
comprobación dentro de una transacción que bloquea la fila del proyecto con `FOR UPDATE`. Superarlo
devuelve **409 `WIP_LIMIT_REACHED`** con el límite en el mensaje.

**Por qué solo `IN_PROGRESS`.** En un tablero de tres columnas, «trabajo en curso» es literalmente
esa columna: `TODO` es la cola de entrada y `DONE` el archivo, y limitarlos no significaría nada.
Un límite por columna arbitraria sería vocabulario kanban sin su semántica.

**Por qué `NULL` y no `0` como «sin límite».** Un proyecto recién creado no debe nacer bloqueado.
`0` es expresable pero absurdo de imponer, así que lo rechazan a la vez el esquema Zod y un `CHECK`
del motor.

**Por qué `FOR UPDATE` y no un `SELECT count(*)`.** Es la condición de carrera clásica de
comprobar-y-actuar. Sin el bloqueo, dos peticiones simultáneas leen «0 en curso», las dos concluyen
que cabe una más y las dos entran. **Se reprodujo:** al quitar el `FOR UPDATE`, la prueba de
concurrencia falla con `expected [ 200, 200 ] to deeply equal [ 200, 409 ]` y el tablero queda con
dos tareas en curso bajo un límite de una. El bloqueo serializa por proyecto, que es el recurso en
disputa; bloquear las filas de `tasks` dejaría fuera justo a la que está entrando.

**La tarea que ya está dentro no se cuenta dos veces.** Sin esa exclusión, corregir una errata en el
título de una tarea en curso con el tablero lleno devolvería 409, y el límite pasaría de regla a
trampa.

**Alternativa descartada: imponerlo en el cliente.** Deshabilitar el botón cuando la columna está
llena es más barato y no es una regla: dos pestañas abiertas, o cualquier cliente de la API, se la
saltan. Una invariante de negocio que solo vive en React no es una invariante. El botón se deja
habilitado a propósito y el servidor responde 409, que es la señal que el método quiere producir.

**Consecuencia.** La cabecera de «En curso» muestra `1/2` y pasa a rojo al alcanzarse. Poner un
límite por debajo del uso actual **no expulsa tareas**: muestra el exceso y bloquea las entradas
nuevas, que es lo que hace un tablero real cuando un equipo aprieta su límite.

### ADR-023 — Columnas configurables sin renunciar a las garantías del ENUM

**Contexto.** El tablero tenía tres columnas porque las columnas **eran** el `ENUM task_status`.
De ese enum cuelgan cuatro garantías: el `CHECK` de `completed_at`, el trigger que lo sella, el
`enum_range` con el que `/stats` asegura que un estado sin tareas salga con 0, y el límite de
trabajo en curso. Permitir añadir y eliminar columnas obliga a decidir qué pasa con las cuatro.

**Decisión.** Tabla `project_columns` con `category task_status NOT NULL`. El enum **no
desaparece**: pasa a ser la categoría de ciclo de vida de cada columna, y varias columnas pueden
compartirla. La unión se impone con una clave foránea compuesta:

```sql
FOREIGN KEY (column_id, status) REFERENCES project_columns (id, category)
```

**Verificado contra PostgreSQL** que el motor rechaza las dos formas de divergencia —mover a una
columna terminal sin cambiar el estado, y cambiar el estado sin mover de columna— y solo acepta el
cambio atómico de ambos. Sin ella, `status` y `column_id` serían dos fuentes de verdad que
acabarían divergiendo: una tarea marcada como completada colgando de «En curso».

**Alternativa descartada: eliminar el enum y sustituirlo por `is_terminal boolean`.** Es lo que
proponía una de las dos revisiones, con el argumento de que clasificar «En revisión» o «Bloqueada»
en tres categorías globales es artificial. Se descartó por dos evidencias:

| | Archivos a tocar | Reversible |
|---|---|---|
| Eliminar el enum | **16** | la migración de retirada, **no** |
| Conservarlo como categoría | **9** | sí, comprobado |

Y porque el argumento es falso: **es el modelo de Jira**, donde cada estado personalizado declara
una de exactamente tres categorías —To Do, In Progress, Done— y Atlassian se niega por diseño a
permitir más. La categoría es justamente lo que hace posible informar entre proyectos con tableros
distintos, que es lo que aquí protege a `/stats`.

**Dos triggers, por la misma razón que el de `completed_at`.** Una regla que solo viva en el
servicio deja fuera al seed, a `psql` y a cualquier otro cliente:

- `projects_create_default_columns` — todo proyecto nace con sus tres columnas. Un proyecto sin
  columnas no es un tablero vacío sino uno roto, donde no se puede crear ni una tarea.
- `tasks_set_column_from_status` — una tarea insertada sin columna se coloca en la primera de su
  categoría. Gracias a él, `INSERT INTO tasks (project_id, title, status)` sigue funcionando igual
  que antes, y las 85 pruebas que ya existían no necesitaron reescribirse.

**La categoría no se puede cambiar después de crear la columna.** Cambiarla exigiría mover a la vez
el `status` de todas sus tareas —la clave foránea compuesta las mantiene unidas—, y hacerlo en
silencio sellaría o borraría fechas de completado por efecto colateral.

**Borrar una columna sigue el precedente de ADR-003.** Sin destino explícito, `409
COLUMN_HAS_TASKS` con el recuento; con `?reassignTo=`, mover y borrar ocurren en la misma
transacción y se respeta el límite del destino. Y no se puede eliminar la última columna de una
categoría: sin `DONE` no habría forma de dar nada por terminado.

**Consecuencia.** Las flechas de la tarjeta pasan a ser contiguas **por posición** y siguen
cumpliendo WCAG 2.5.7 con N columnas —se llega a cualquiera paso a paso—; el salto directo va por
el desplegable del diálogo. La rejilla pasa a `grid-flow-col` con `auto-cols-[minmax(16rem,1fr)]`,
porque `grid-cols-3` colapsaba al añadir la cuarta.

### ADR-024 — El orden de las tareas es configuración de la columna, no del navegador

**Contexto.** Cada etapa se lee con una pregunta distinta: en la cola de entrada interesa qué tomar
a continuación; en el trabajo en curso, qué lleva más tiempo atascado; en el archivo, lo recién
terminado. Un criterio único para todo el tablero obliga a un compromiso en las tres.

**Decisión.** `project_columns.sort`, un `ENUM column_sort` con cuatro criterios. Es configuración
compartida del tablero, no preferencia de quien mira.

**Por qué no `localStorage`.** Es lo que proponía una de las dos revisiones. No se comparte por
enlace, no sobrevive a cambiar de equipo o navegador, y contradice ADR-019, que fijó que el estado
del tablero vive en un sitio compartible. Las columnas ya son configuración del equipo; su orden
también lo es.

**Por qué no un único selector para todo el tablero, en la URL.** Es lo que proponía la otra
revisión, con el argumento de que un orden por columna exigiría N consultas o penalizar la caché.
**Se midió y es falso:** una sola consulta sirve un orden distinto por columna mediante una escalera
de `CASE` sobre `pc.sort`, donde cada rama devuelve NULL salvo la del criterio activo.

```sql
ORDER BY pc.position,
  CASE pc.sort WHEN 'priority_asc'  THEN t.priority   END ASC,
  CASE pc.sort WHEN 'priority_desc' THEN t.priority   END DESC,
  CASE pc.sort WHEN 'created_asc'   THEN t.created_at END ASC,
  CASE pc.sort WHEN 'created_desc'  THEN t.created_at END DESC,
  t.created_at DESC, t.id
```

Comprobado con tres columnas y tres criterios distintos en una sola pasada. El desempate final
mantiene el orden estable cuando el criterio elegido empata, para que dos cargas seguidas no
intercambien tarjetas.

**No se ofrece orden alfabético.** No responde a ninguna decisión de trabajo —nadie elige qué hacer
por la letra inicial— y solo añadiría relleno al selector.

### ADR-005 (matiz) — Escribir la respuesta confirmada en la caché no es optimismo

**Contexto.** Sin actualizaciones optimistas, cambiar el estado de una tarjeta dispara `PATCH` → invalidación → refetch, y la tarjeta se queda quieta durante ese viaje.
**Matiz.** ADR-005 prohíbe pintar un estado **antes** de que la base lo confirme; eso sigue en pie y no hay `onMutate` ni rollback en ninguna parte. Lo que sí se hace es que, en `onSuccess`, cuando PostgreSQL **ya respondió 200 con la tarea actualizada**, esa respuesta se escribe en la caché con `setQueryData`. No es optimismo: es aplicar el dato confirmado sin pagar un segundo viaje.
**Y se invalida igual.** Si el parche cambió la prioridad y hay un filtro por prioridad activo, la lista escrita a mano podría contener una tarea que ya no casa; la invalidación posterior lo corrige en segundo plano sin que el usuario vea el hueco.

### ADR-019 — Filtros en la URL, y ninguno por estado

**Contexto.** RF-13 está implementado y probado en la API. Falta decidir cómo se expone.
**Decisión.** Búsqueda por texto y filtro por prioridad, ambos **en la URL** con `replaceState`. **No hay filtro por estado.**
**Por qué no el de estado.** Las tres columnas *son* la dimensión de estado. Filtrar por `DONE` dejaría dos columnas vacías: el tablero parecería roto, no filtrado.
**Por qué en la URL.** Un tablero filtrado se puede compartir por enlace y sobrevive a una recarga. El coste fue mínimo porque el router propio ya usa `useSyncExternalStore`: bastó con incluir `location.search` en la instantánea. Se usa `replaceState` y no `pushState` para que teclear en el buscador no llene el historial.
**Consecuencia.** Los filtros se aplican en SQL, no sobre un array ya descargado, y una columna sin coincidencias distingue «Sin tareas que coincidan» de «Sin tareas».

### ADR-020 — Objetivos táctiles de 44 px, y el conflicto del arrastre con el carrusel

> **Revisado por ADR-021.** El arrastre acabó entrando. Lo que este ADR mide sobre el conflicto
> con el carrusel sigue siendo cierto; lo que le faltaba era que un retardo de activación separa los
> dos gestos. Los objetivos de 44 px se mantienen y son ahora la alternativa que exige WCAG 2.5.7.

**Contexto.** Al revisar la aplicación en un móvil apareció una fricción real: los controles de la
tarjeta —editar, borrar y las dos flechas de transición— miden **28×32 px**. Cumplen el mínimo de
**WCAG 2.2 SC 2.5.8** (24×24, nivel AA) pero no la recomendación de **SC 2.5.5** ni la de Apple
(44×44), y con el pulgar se fallan. La reacción intuitiva es pedir arrastre de tarjetas.

**Decisión.** Elevar el objetivo táctil a **44×44 px solo donde el puntero es grueso**
(`pointer-coarse`), añadir `touch-manipulation` para eliminar el retardo de ~300 ms del doble toque,
y dar respuesta inmediata al toque con `active:scale`. En ratón los controles siguen en 28×32: la
densidad de la interfaz en escritorio no es un problema que haya que resolver.

Medido después del cambio, sobre los 18 controles del tablero en un viewport de 375 px: **18 de 18
alcanzan 44×44**, frente a 0 de 18 antes. En puntero fino siguen en 28×32.

**El arrastre se mantiene descartado, y ahora hay una razón medida además de la de coste.** Por
debajo de `lg` el tablero es un carrusel horizontal con `scroll-snap-type: x mandatory`: en un móvil
de 375 px mide 955 px de ancho. **El gesto de arrastrar una tarjeta hacia otra columna es
exactamente el gesto de desplazar el carrusel**, y para soltarla hay que desplazar mientras se
arrastra. No es un detalle de implementación: es un conflicto entre dos gestos que ocupan el mismo
movimiento del dedo, y la salida habitual —un `delay` de activación y desactivar el anclaje durante
el arrastre— compra el arrastre a cambio de que el carrusel deje de responder como espera el
sistema operativo.

**Y aunque entrara, no sustituiría a las flechas.** **WCAG 2.2 SC 2.5.7 (Dragging Movements**,
nivel AA) exige que toda funcionalidad que dependa de arrastrar tenga una alternativa de un solo
puntero. Las flechas son esa alternativa. El arrastre sería una capa opcional encima, no un
reemplazo, y con él habría que sostener dos caminos de mutación en lugar de uno.

**Alternativas descartadas.** Deslizar la tarjeta compite con el mismo scroll horizontal. Una
pulsación larga es poco descubrible y añade el mismo conflicto. Un menú «Mover a…» de dos toques
funciona, pero duplica lo que la flecha ya hace en uno.

**Relación con ADR-018.** No lo sustituye: lo confirma con evidencia que en su momento no se tenía.
ADR-018 descartó el arrastre por coste y accesibilidad; esta revisión mide el coste ergonómico real
de su alternativa y lo corrige, sin cambiar la decisión de fondo.

### ADR-021 — Arrastre de tarjetas, encima de las flechas y no en su lugar

**Contexto.** ADR-018 descartó el arrastre por coste y accesibilidad, y ADR-020 lo confirmó al medir
el conflicto con el carrusel. Ambos siguen siendo ciertos en lo que afirman. Lo que ninguno de los
dos evaluó es que **mantener pulsado y deslizar son gestos distinguibles**: un retardo de activación
los separa, que es como lo resuelven los tableros que sí lo tienen. Con esa pieza, el conflicto deja
de ser estructural y pasa a ser un parámetro.

**Decisión.** `@dnd-kit/core`, sin `@dnd-kit/sortable`: una tarjeta cambia de columna, no se ordena
dentro de ella, así que el paquete de ordenación solo añadiría superficie de error.

| | |
|---|---|
| Ratón | `MouseSensor`, activación por **distancia de 6 px** |
| Táctil | `TouchSensor`, activación por **250 ms** con tolerancia de 8 px |
| Teclado | **sin `KeyboardSensor`** |

El retardo es lo que separa los dos gestos: un deslizamiento rápido sigue desplazando el carrusel, y
solo la pulsación mantenida levanta la tarjeta. La tolerancia cancela la activación si el dedo se
mueve antes de cumplirse el tiempo, devolviendo el gesto al scroll nativo.

No se registra `KeyboardSensor` a propósito: interceptaría Espacio, Enter y las flechas de
dirección, que son justo las teclas de los botones que viven dentro de la tarjeta. La vía de teclado
son esos botones.

**Las flechas se quedan, y no es una cortesía.** **WCAG 2.2 SC 2.5.7 (Dragging Movements**, nivel
AA) exige que toda funcionalidad que dependa de arrastrar tenga una alternativa de un solo puntero.
El arrastre es una capa encima; las flechas son el camino garantizado.

**El anclaje se apaga mientras se arrastra.** `scroll-snap-type: mandatory` se resuelve en el hilo
del compositor: si sigue activo mientras el autoscroll desplaza el carrusel, el navegador tira de
vuelta hacia la columna centrada y la tarjeta salta. El contenedor alterna a `snap-none` durante el
arrastre y lo recupera al soltar.

**Arrastrar permite cualquier columna; las flechas, solo la contigua.** No es una incoherencia: las
flechas son contiguas porque en una tarjeta estrecha caben dos botones, no tres, y el dominio no
prohíbe pasar de `TODO` a `DONE`. Obligar a dos arrastres para llegar a «Completada» sería una
limitación de la interfaz disfrazada de regla de negocio.

**Soltar fuera devuelve la tarjeta a su sitio** con la animación de vuelta del `DragOverlay`, sin
disparar ninguna petición. El clon se pinta en un portal porque dentro del carrusel el
`overflow-x: auto` lo recortaría al salir de la columna.

**El foco depende del origen del movimiento.** Con las flechas se conserva lo de ADR-018: el botón
pulsado se desmonta y la tarjeta se enfoca a sí misma. Con el arrastre no se enfoca nada: el puntero
no ha perdido su referencia y forzar el foco pintaría un anillo que nadie pidió.

**Coste medido.** El bundle pasa de **68,40 kB a 84,26 kB gzip: +15,86 kB**. Es más de lo que costaba
`react-router` (+13,4 kB), que sí se descartó, pero aquel resolvía dos rutas que ya funcionaban con
sesenta líneas propias; este entrega una interacción que no existía.

**Lo que NO se hizo.** Zonas de destino fijas flotando sobre el tablero: restan altura en una
pantalla de 375 px y añaden una segunda representación del flujo que ya comunican las columnas.

**Relación con ADR-005.** El proyecto evita el optimismo artificial y la caché contiene solo lo que
PostgreSQL confirmó. Eso **no cambia**. Al soltar, la tarjeta se queda en la columna destino mediante
una **proyección de presentación** —un estado local que dice «esta tarjeta se está moviendo allí»—,
no escribiendo una predicción en la caché. Al no haber predicción, el error no necesita rollback:
se retira la proyección y la tarjeta reaparece donde el servidor dice que está.

## 4. Stack final

| Capa | Elección | Versión |
|---|---|---|
| Lenguaje | TypeScript `strict` | 5.x |
| Backend | Node + Express | 22 LTS / 4.x |
| Validación | Zod | 3.x |
| Datos | `pg` + patrón repositorio | 8.x |
| Migraciones | `node-pg-migrate` | 7.x |
| Base de datos | PostgreSQL | 16 |
| Frontend | React + Vite | 18.x / 5.x |
| Estado de servidor | TanStack Query | 5.x |
| Estilos | Tailwind CSS + lucide-react | 4.x |
| Enrutado | propio, sobre la History API | — |
| Modales | elemento nativo `<dialog>` | — |
| Arrastre | `@dnd-kit/core` (ADR-021) | 6.3.1 |
| Pruebas | Vitest + Supertest | — |
| E2E | Playwright (9 escenarios) | — |
| CI | GitHub Actions | — |
| Gates | `sistema-multiagente-sdlc` (`quality-gate`, `coverage-diff`) | 2.2.2 |
| Gestor de paquetes | npm | 10.x |

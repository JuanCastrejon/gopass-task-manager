# Proposal: SL-10 — Filtros en el panel de proyectos

## Why

El tablero de tareas tiene buscador y filtro por prioridad desde SL-06; el panel de proyectos, que es
la primera pantalla que se ve, no tiene ninguno. Con cuatro proyectos de seed no molesta, pero es la
pantalla que un evaluador abre primero y la asimetría se lee como un hueco, no como una decisión.

Un proyecto **no tiene prioridad propia**, así que el filtro no puede copiarse tal cual: aquí el chip
significa «este proyecto tiene al menos una tarea de esa prioridad», que es una condición existencial
sobre los hijos y exige que la API la sepa responder.

## What Changes

- **WP1 — Conteo por prioridad en la API:** `GET /projects` y `GET /projects/:id` añaden
  `byPriority: { LOW, MEDIUM, HIGH }`. Se calcula con tres `COUNT(...) FILTER` colgados del `GROUP BY`
  que `SUMMARY_QUERY` ya hacía para `taskCount` y `doneCount`.
- **WP2 — Comportamiento de filtrado extraído (`lib/use-filtros-de-url.ts`):** el buscador con
  retardo y los chips salen de `TaskBoard` a un hook que ambas pantallas comparten, incluida la
  lectura de `window.location` dentro del temporizador que evita que un chip recién pulsado se
  desmarque solo.
- **WP3 — Primitivos de presentación (`components/ui/Filtros.tsx`):** `CampoBusqueda`,
  `FiltroChip` y `GrupoDePrioridad`. Sin lógica: cada pantalla compone su barra.
- **WP4 — Desglose en la tarjeta (`ProjectCard.tsx`):** `PriorityBadge` acepta `count` y la tarjeta
  pinta las prioridades con tareas. Sin esto el chip escondería tarjetas sin motivo visible.
- **WP5 — Filtrado en cliente (`ProjectsPage.tsx`):** `useMemo` sobre la lista ya cacheada, más un
  estado vacío que distingue «no hay proyectos» de «ninguno coincide».
- **WP6 — Pruebas:** 3 de integración de API, 12 de web y 1 E2E.

## Capabilities

### Modified Capabilities
- `projects-api` — el resumen del proyecto incorpora el desglose por prioridad.
- `projects-web` — el panel gana buscador, chips de prioridad y un vacío propio del filtrado.
- `tasks-board-web` — sin cambio funcional: pasa a consumir el hook y los primitivos compartidos.

## Decisiones con su porqué

- **Filtrado en cliente, al revés que en el tablero.** Las tareas de un proyecto pueden crecer sin
  techo y su filtro viaja al `ILIKE` de PostgreSQL; los proyectos son un catálogo acotado, sin
  paginación, y la lista entera ya está en la caché de React Query desde el primer render. Un viaje
  por tecla añadiría latencia, una clave de caché por combinación y un parpadeo de esqueleto, sin
  quitarle trabajo a nadie.
- **Tres columnas `FILTER` y no el `jsonb_object_agg` de `/stats`.** Medido sobre 204 proyectos y
  20 011 tareas: las columnas dejan el plan en los mismos 275 buffers compartidos y el tiempo dentro
  del ruido; el patrón de `/stats` trasladado a por-proyecto sube a 1175 buffers y 16,8-24,5 ms.
  Allí agrega una vez para toda la tabla; aquí degeneraría en un escaneo correlacionado.
- **Hook + primitivos, y no un `<BarraDeFiltros>` monolítico.** Se comparte mientras la variación sea
  de datos y de texto. Un componente que además decidiera si se busca por título o por nombre, qué
  significa el chip y cuál es el predicado conocería dos dominios y saldría más caro de leer que las
  dos copias que evita.
- **Se filtra por lo tecleado, no por lo que hay en la URL.** Al no haber petición, esperar los
  250 ms del retardo solo serviría para que la lista respondiera tarde. La URL se actualiza por
  detrás y sigue siendo compartible.

## Exclusiones de alcance

- **Filtrar proyectos en el servidor.** Sin paginación ni volumen que lo justifique, sería latencia
  sin contrapartida. El día que haya paginación, esta decisión se revisa.
- **Filtrar por estado o por avance.** El chip de prioridad ya cubre la pregunta que se hace de
  verdad —«¿dónde está lo urgente?»—; añadir ejes multiplica los estados vacíos que hay que explicar.
- **Ordenar la lista.** El orden lo fija PostgreSQL (`created_at DESC`) y nadie ha pedido cambiarlo.

## Impact

`SUMMARY_QUERY` sigue siendo una sola consulta compartida por el listado y el detalle, así que ambos
devuelven el desglose. `TaskBoard` no cambia de comportamiento: se le retira el código que ahora vive
en el hook y en los primitivos, y los cinco E2E siguen pasando, arrastre incluido.

## Perfil de Readiness

`L2` (Operational). Cambio aditivo de contrato —ningún campo se retira ni se renombra—, sin cambios
de esquema ni de superficie de ataque.

## Viabilidad y esfuerzo

- **Esfuerzo:** M
- **Riesgo técnico:** bajo — el coste del SQL está medido y el refactor de `TaskBoard` queda cubierto
  por los E2E que ya existían.
- **Riesgo funcional:** bajo — el panel sin filtros seguía funcionando; esto añade controles sobre
  una lista que ya se pintaba igual.

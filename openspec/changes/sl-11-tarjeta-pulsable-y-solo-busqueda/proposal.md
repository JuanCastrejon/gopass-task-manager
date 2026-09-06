# Proposal: SL-11 — La tarjeta abre el proyecto, y fuera solo se busca

## Why

Al revisar el panel recién entregado en SL-10 aparecieron dos cosas que no se sostienen.

**Los chips de prioridad prometían una dimensión que la entidad no tiene.** Un proyecto no tiene
prioridad; el chip significaba «contiene al menos una tarea de esa prioridad», que es una relación
sobre los hijos disfrazada de atributo propio. Trello, Jira, Linear y Asana coinciden: fuera del
tablero se busca por nombre, y los filtros ricos viven dentro, donde la dimensión sí existe.

**La tarjeta se comportaba como un cartel con un enlace pequeño al pie.** El gesto que la gente hace
en un catálogo es pulsar la tarjeta, no apuntar a un enlace de 90 px.

## What Changes

- **WP1 — Solo buscador en el panel:** se retiran `GrupoDePrioridad` del panel y el predicado de
  prioridad. `useFiltrosDeUrl` conserva `prioridad` porque el tablero sí la usa.
- **WP2 — La tarjeta entera es el enlace:** un `<a>` real envuelve el contenido no interactivo;
  editar y eliminar pasan a ser **hermanos** superpuestos, no descendientes.
- **WP3 — Señal de urgencia en vez de desglose:** la tarjeta muestra solo las tareas de prioridad
  alta, y solo si las hay.

## Capabilities

### Modified Capabilities
- `projects-web` — el panel pierde los chips; la tarjeta gana navegación completa.

## Decisiones con su porqué

**La tarjeta navega con un enlace envolvente, no con un pseudo-elemento estirado ni con un `onClick`
sobre el `<article>`.** Las tres se midieron en el navegador con `elementFromPoint` y clics reales:

| Patrón | Texto seleccionable | Clic en la descripción navega |
|---|---|---|
| Pseudo-elemento `::after` en `inset: 0` | **no** — el overlay recibe el puntero | sí |
| El mismo, subiendo el párrafo con `z-index` | sí | **no** — deja una franja inerte |
| Enlace envolvente | sí | sí |

El pseudo-elemento es el patrón más citado y aquí es el peor: el `<p>` nunca recibe el ratón, así
que la descripción no se puede seleccionar, y la corrección habitual —elevar el párrafo— abre un
rectángulo muerto en el centro de una tarjeta que por lo demás es pulsable.

**`draggable={false}` en el enlace.** No lo propuso ninguna de las dos revisiones. Los `<a>` son
arrastrables por defecto, así que sin esto arrastrar sobre la descripción arrastra el enlace en vez
de seleccionar texto.

**Guarda de selección.** Si al soltar queda una selección viva, el `onClick` cancela la navegación:
copiar una descripción no debe abrir el proyecto.

**`aria-label` en el enlace.** Sin ella el nombre accesible sería el contenido entero de la
tarjeta —título, descripción, avance y porcentaje— leído como el nombre de un enlace.

**Se conserva «Ver tareas» como `<span>`, no como segundo enlace.** Es la única afordancia visible
de que ahí se entra, y en táctil no hay `hover` que lo insinúe. Como enlace duplicaría una parada de
tabulación hacia el mismo destino.

**Se conserva `byPriority` en la API.** Responde a una pregunta propia del catálogo —«¿dónde hay
trabajo urgente?»— y ahora alimenta la señal de alta prioridad. Se descartó revertirlo: un agregado
del proyecto es tan legítimo como `taskCount` o `doneCount`, y deshacer un cambio de contrato ya
probado y medido a menos de un día de la entrega es riesgo sin contrapartida.

Se descartó mantener las tres píldoras: en una rejilla de ocho proyectos son veinticuatro etiquetas
compitiendo con la barra de avance. Baja y media son estado operativo normal; solo lo urgente pide
una decisión desde el catálogo.

## Exclusiones de alcance

- **`role="link"` con `tabIndex` sobre el `<article>`.** Anida controles dentro de un elemento con
  rol de enlace y obliga a reimplementar Enter, Espacio, el clic central y «abrir en pestaña nueva»
  que el navegador ya da gratis.
- **Retirar «Ver tareas».** Deja la navegación sin afordancia visible.

## Impact

Tres paradas de tabulación por tarjeta, las mismas que antes: editar, eliminar y el enlace. Los
cinco E2E siguen pasando; los que navegaban por el nombre accesible «Ver tareas» ahora lo hacen por
«Abrir tareas de …».

## Perfil de Readiness

`L1` (Presentational). Sin cambios de esquema, de contrato ni de superficie de ataque.

## Viabilidad y esfuerzo

- **Esfuerzo:** S
- **Riesgo técnico:** bajo — el patrón está medido en el navegador y cubierto por E2E.
- **Riesgo funcional:** bajo — se retira un control y se amplía la zona de un enlace que ya existía.

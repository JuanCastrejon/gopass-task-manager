# Design: SL-09 — Arrastre sobre un carrusel con anclaje

## Context

El tablero tiene dos modos: carrusel con `scroll-snap` por debajo de `lg`, rejilla por encima. El
arrastre tiene que funcionar en los dos sin romper el desplazamiento nativo del primero.

## Goals / Non-Goals

**Goals.** Mover una tarea entre estados arrastrándola, con ratón y con dedo. Devolver la tarjeta a
su sitio si se suelta fuera. No degradar las flechas ni su accesibilidad.

**Non-Goals.** Reordenar dentro de la columna. Arrastre por teclado. Sustituir las flechas.

## Decisions

### 1. `@dnd-kit/core` sin `sortable`

Una tarjeta cambia de columna; no se ordena dentro de ella. El paquete de ordenación solo añadiría
superficie de error. Se descarta `@hello-pangea/dnd`: modela listas reordenables y congela la
geometría al iniciar el arrastre, lo que en un contenedor cuyo scroll resuelve el compositor
desincroniza las posiciones respecto al DOM real.

### 2. La activación separa los gestos

`MouseSensor` por distancia (6 px) para que en escritorio responda de inmediato sin que un clic
impreciso levante la tarjeta. `TouchSensor` por tiempo (250 ms, tolerancia 8 px): por debajo del
umbral el gesto sigue siendo del carrusel. Es la decisión que hace viable todo lo demás.

### 3. El anclaje se apaga durante el arrastre

`scroll-snap-type: mandatory` se resuelve en el hilo del compositor. Si sigue activo mientras el
autoscroll desplaza el carrusel, el navegador tira de vuelta hacia la columna centrada y la tarjeta
salta. El contenedor alterna a `snap-none` y lo recupera al soltar.

### 4. El clon vive en un portal

Dentro del carrusel, el `overflow-x: auto` recortaría la tarjeta al salir de su columna.
`DragOverlay` la pinta fuera del flujo, y su animación de vuelta es lo que comunica «no pasó nada»
cuando se suelta en un sitio no válido.

### 5. Proyección de presentación, no escritura optimista

La caché sigue conteniendo solo lo confirmado por PostgreSQL (ADR-005). Al soltar, un estado local
dice «esta tarjeta se está moviendo allí» y las columnas se pintan con el estado proyectado. Al no
haber predicción en la caché, el error no necesita rollback: se retira la proyección y la tarjeta
reaparece donde el servidor dice que está.

### 6. El foco depende del origen

Con las flechas se conserva el auto-foco de ADR-018, porque el botón pulsado se desmonta al cambiar
la tarjeta de columna. Con el arrastre no se enfoca nada: el puntero no ha perdido su referencia.

## Readiness / NFR Strategy (L2)

Sin cambios de esquema ni de contrato. El endpoint es el mismo `PATCH /api/tasks/:id` que ya usan
las flechas y que ya está cubierto por pruebas de integración.

## Risks / Trade-offs

| Riesgo | Mitigación |
|---|---|
| El sensor se come los clics de los botones internos | Detención en fase de captura, verificada a mano en los cuatro |
| Anclaje y autoscroll compitiendo | `snap-none` mientras dura el arrastre |
| Hardware táctil real distinto de la emulación | Comprobación manual antes de entregar; las flechas siguen ahí si falla |
| +15,86 kB gzip en el bundle | Aceptado y registrado en ADR-021 |

## Migration Plan

No hay migración: es aditivo. Revertir es retirar el `DndContext` y la dependencia; las flechas
siguen funcionando sin tocar nada más.

## Open Questions

Ninguna bloqueante. Queda pendiente la validación en iOS Safari y Chrome Android sobre dispositivo
físico, que la emulación no sustituye.

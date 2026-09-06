# Research: SL-09 — Separación de gestos táctiles y conflicto con el carrusel

**Perfil operativo:** `ANALYSIS` · **Fuente primaria:** la aplicación corriendo, medida en el navegador.

## 1. El descarte anterior y qué le faltaba

El arrastre se descartó dos veces. ADR-018 lo descartó por coste y accesibilidad. ADR-020 lo
confirmó midiendo el conflicto con el carrusel: por debajo de `lg` el tablero es un contenedor con
`overflow-x: auto` y `scroll-snap-type: x mandatory`, y en un móvil de 375 px mide **955 px** de
ancho, así que arrastrar hacia otra columna es el mismo movimiento del dedo que desplazarlo.

Lo que ninguno de los dos evaluó es que **mantener pulsado y deslizar son gestos distinguibles en el
tiempo**, no en la dirección. Un retardo de activación los separa sin ambigüedad.

## 2. Medición que decidió el cambio

Emulación táctil a 375 px, observando `scroll-snap-type` del carrusel como testigo del estado del
sensor:

| Gesto | Resultado |
|---|---|
| Mantener pulsado 300 ms | arrastre **activado**, el anclaje pasa a `none` |
| Deslizar 60 ms / 60 px | arrastre **no** activado, el anclaje sigue en `x mandatory` |

Confirmado: por debajo del umbral el carrusel se comporta como siempre.

## 3. Lo que no se puede tocar

**WCAG 2.2 SC 2.5.7 (Dragging Movements**, nivel AA) exige una alternativa de un solo puntero para
toda funcionalidad que dependa de arrastrar. Las flechas de transición de ADR-018 son esa
alternativa y no pueden retirarse. El arrastre solo puede ser una capa encima.

## 4. Coste medido

El bundle pasa de **68,40 kB a 84,26 kB gzip**: **+15,86 kB**. Más que `react-router` (+13,4 kB),
que sí se descartó — pero aquel sustituía sesenta líneas propias que ya funcionaban, y este entrega
una interacción que no existía.

## 5. Vacíos abiertos

El arrastre táctil sobre hardware real (iOS Safari, Chrome Android) no está verificado: la
emulación reproduce los eventos, no la física del compositor. Queda como comprobación manual previa
a la entrega.

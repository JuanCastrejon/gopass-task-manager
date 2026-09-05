# Tasks: SL-09 — Arrastre de tarjetas entre columnas

## 1. Cableado

- [x] 1.1 Instalar `@dnd-kit/core@6.3.1` y medir el delta del bundle
- [x] 1.2 `DndContext` con `MouseSensor` (6 px) y `TouchSensor` (250 ms / 8 px)
- [x] 1.3 Cada columna como `useDroppable` cuyo `id` es el estado

## 2. Superficie arrastrable

- [x] 2.1 `useDraggable` en la tarjeta, sin los `attributes` que impondrían `role="button"`
- [x] 2.2 Editar, borrar y las dos flechas detienen el gesto en fase de captura
- [x] 2.3 Verificado a mano que los cuatro controles siguen respondiendo

## 3. Carrusel

- [x] 3.1 `scroll-snap-type` a `none` durante el arrastre y restaurado al soltar
- [x] 3.2 Autoscroll horizontal con umbral del 18 % para no invadir el gesto del sistema
- [x] 3.3 `DragOverlay` en portal, con animación de vuelta

## 4. Mutación

- [x] 4.1 Proyección de presentación; la caché sigue solo con lo confirmado (ADR-005)
- [x] 4.2 Soltar fuera o en la columna de origen no dispara petición
- [x] 4.3 El arrastre permite cualquier columna; las flechas siguen contiguas
- [x] 4.4 Auto-foco solo cuando el origen es una flecha

## 5. Validación

- [x] 5.1 E2E: arrastrar de «Por hacer» a «Completada» y sobrevivir a la recarga
- [x] 5.2 E2E: soltar fuera devuelve la tarjeta sin petición
- [x] 5.3 Sin inestabilidad: 10 de 10 con `--repeat-each=5`
- [x] 5.4 Medido que mantener 300 ms activa el arrastre y deslizar 60 ms no
- [x] 5.5 ADR-021 escrito, y notas de revisión en ADR-018 y ADR-020
- [ ] 5.6 Comprobación manual en iOS Safari y Chrome Android sobre dispositivo físico

# Tasks: SL-20 — Precisión del arrastre entre columnas

## 1. Diagnóstico

- [x] 1.1 Reproducir el defecto con una prueba temporal usando arrastre por pasos
- [x] 1.2 Distinguir la rama ejecutada por la posición resultante: 512 frente a 2048
- [x] 1.3 Identificar `closestCenter` como causa raíz

## 2. Implementación

- [x] 2.1 Detector compuesto en `web/src/features/tasks/collision.ts`
- [x] 2.2 Indicador de inserción visible, solo en columnas con orden manual
- [x] 2.3 Columna con límite lleno marcada como destino no válido, sin petición al soltar

## 3. Pruebas

- [x] 3.1 Primera posición con posición 512
- [x] 3.2 Última posición con posición 2048
- [x] 3.3 Columna vacía
- [x] 3.4 Columna con orden automático: sin indicador y sin mutar a manual (protege SL-15)
- [x] 3.5 Columna con límite lleno: sin peticiones

## 4. Pendiente

- [ ] 4.1 ADR sobre el detector compuesto en `docs/spec/04-arquitectura.md`
- [ ] 4.2 Recuentos en `README.md` y `docs/spec/05-estrategia-calidad.md`
- [ ] 4.3 PR que cierre el issue #25

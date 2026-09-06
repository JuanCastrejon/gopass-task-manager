# Tasks: SL-21 — Renombrar una columna desde la cabecera

## 1. Implementación

- [x] 1.1 Componente `CabeceraColumna.tsx` con `<h3><button>` que conmuta a `<input>`
- [x] 1.2 Foco transferido al abrir con el texto seleccionado, y devuelto al botón al cerrar
- [x] 1.3 `Enter` guarda, `Escape` cancela, `blur` guarda si cambió y no queda vacío
- [x] 1.4 Sin petición cuando el valor es idéntico o vacío tras recortar
- [x] 1.5 Nombre accesible en `aria-label` y no en `title`, con el nombre visible incluido
- [x] 1.6 Convivencia con el arrastre en las dos direcciones

## 2. Pruebas

- [x] 2.1 Abrir, guardar con Enter, cancelar con Escape, guardar con blur, y el caso del 409
- [x] 2.2 E2E de renombrado que sobrevive a la recarga y avisa del conflicto sin perder lo escrito

## 3. Pendiente

- [x] 3.1 ADR sobre el patrón de edición en el sitio y por qué `aria-label` y no `title`
- [x] 3.2 Recuentos en `README.md` y `docs/spec/05-estrategia-calidad.md`
- [ ] 3.3 PR que cierre el issue #26

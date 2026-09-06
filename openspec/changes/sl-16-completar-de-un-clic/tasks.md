# Tasks: SL-16 — Completar una tarea de un clic desde la tarjeta

## 1. Interfaz y componentes

- [x] 1.1 Botón de completado en `TaskCard.tsx` con soporte de destino único directo y menú accesible para múltiples destinos
- [x] 1.2 Transformación del círculo en indicador de estado visual y accesible en tareas completadas
- [x] 1.3 Bloqueo de propagación de eventos con `SIN_ARRASTRE` para evitar conflictos con los sensores de `@dnd-kit`
- [x] 1.4 Derivación y paso de `columnasDone` desde `TaskBoard.tsx` hacia cada tarjeta

## 2. Accesibilidad

- [x] 2.1 Uso de `<button type="button">` sin prometer semántica de checkbox ni `aria-pressed`
- [x] 2.2 Atributos `aria-haspopup="menu"`, `aria-expanded` y etiquetas dinámicas `aria-label`
- [x] 2.3 Enfoque automático al primer elemento del menú al abrir y retorno del foco al disparador al cerrar con `Escape`

## 3. Validación y pruebas

- [x] 3.1 5 pruebas de componentes en `web/src/features/tasks/__tests__/completar-tarea.test.tsx` (clic directo, menú múltiple, rechazo del antipatrón de Kaneo, indicador no interactivo y teclado)
- [x] 3.2 2 pruebas E2E en Playwright (`e2e/completar-de-un-clic.spec.ts`) con persistencia tras recarga y cálculo de barra de avance
- [x] 3.3 Medición del bundle frontend (+0,92 kB gzip: 89,60 -> 90,52 kB)

## 4. Documentación de arquitectura

- [x] 4.1 ADR-027 en `docs/spec/04-arquitectura.md` con justificación de mover la tarea, coherencia con límites de WIP y alternativas descartadas

## 5. Pendiente

- [ ] 5.1 Issue enriquecido con las 19 secciones del estándar
- [ ] 5.2 PR contra `develop` y trazabilidad de cierre

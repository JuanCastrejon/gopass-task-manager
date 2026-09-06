# Research: SL-04 — Experiencia de Usuario, Accesibilidad y Retención de Caché

## 1. Por qué no deshabilitar el botón de borrado
Deshabilitar un botón cuando `taskCount > 0` oculta la regla del negocio al usuario ("botón ciego") y depende de contadores en memoria que pueden estar desactualizados. Permitir el intento de eliminación dentro del modal y capturar el 409 `PROJECT_HAS_TASKS` demuestra de forma pedagógica la regla de integridad referencial.

## 2. Prevención de Flickering con TanStack Query
El uso de `isPending` retiene los datos previos en memoria durante las revalidaciones de fondo (`queryClient.invalidateQueries`), evitando que la interfaz parpadee a estados de esqueleto tras crear o editar proyectos.

## 3. Accesibilidad de Foco en SPAs
Al navegar entre el listado y el detalle, los botones desmontados dejan el foco en `body`. Restaurar programáticamente el foco en `<main tabIndex={-1}>` garantiza continuidad en tecnologías de asistencia y navegación por teclado.

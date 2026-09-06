# Research: SL-06 — Usabilidad Kanban, Enfoque Accesible y Filtros en URL

## 1. Por qué no hay filtro de estado en la barra de herramientas
El tablero Kanban utiliza las columnas espaciales como representación intrínseca del estado (`TODO`, `IN_PROGRESS`, `DONE`). Añadir un selector de estado en la cabecera vaciaría 2 de las 3 columnas, generando la ilusión de fallo en la aplicación en lugar de una experiencia filtrada limpia. La búsqueda y las prioridades son los ejes ortogonales adecuados para filtrar.

## 2. Preservación del Foco Accesible (WCAG 2.1 AA)
Al mover una tarjeta de una columna a otra en React, el nodo DOM previo se desmonta y un nuevo nodo se monta en la columna destino. Si no se gestiona el foco, este se restablece al `body`, desorientando a usuarios que navegan mediante teclado. La implementación de `autoFocus` mediante `useRef` transfiere el foco al nuevo contenedor de la tarjeta inmediatamente tras el remontado.

## 3. Evitar condiciones de carrera en el Debounce de Búsqueda
Si el temporizador de 250 ms capturara los parámetros de búsqueda del cierre del render anterior, cambiar un chip de prioridad mientras se escribe provocaría que el temporizador sobrescribiera la URL omitiendo la prioridad recién seleccionada. La solución arquitectónica es leer la query string en vivo de `window.location.search` en el momento exacto en que expira el temporizador.

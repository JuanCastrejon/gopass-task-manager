# Tasks: SL-11 — La tarjeta abre el proyecto, y fuera solo se busca

## 1. Solo buscador en el panel

- [x] 1.1 Retirar `GrupoDePrioridad` y el predicado de prioridad de `ProjectsPage`
- [x] 1.2 `hayBusqueda` propio, para que un `?priority=` sobrante en una URL antigua no mienta
- [x] 1.3 Copia del vacío y del botón: «Limpiar búsqueda», no «Limpiar filtros»
- [x] 1.4 `useFiltrosDeUrl` conserva `prioridad`: el tablero sí la usa

## 2. Tarjeta pulsable

- [x] 2.1 Medir las tres alternativas en el navegador con `elementFromPoint` y clics reales
- [x] 2.2 Enlace envolvente; editar y eliminar como hermanos superpuestos
- [x] 2.3 `draggable={false}`, que ninguna de las dos revisiones propuso
- [x] 2.4 Guarda de selección: soltar con texto seleccionado no navega
- [x] 2.5 `aria-label` en el enlace; «Ver tareas» pasa a `<span>`
- [x] 2.6 Verificado en la aplicación: 1 enlace, 2 botones, ninguno dentro del enlace
- [x] 2.7 Verificado que los botones abren su diálogo sin navegar

## 3. Señal de urgencia

- [x] 3.1 La tarjeta muestra solo la prioridad alta, y solo si la hay
- [x] 3.2 `byPriority` se conserva en la API, con consumidor

## 4. Validación

- [x] 4.1 20 pruebas web, incluida la estructura del enlace y las paradas de tabulación
- [x] 4.2 E2E: pulsar la descripción abre el proyecto
- [x] 4.3 Los cinco E2E pasan; los cuatro anteriores, con el nombre accesible nuevo
- [x] 4.4 Comprobado a 320 px

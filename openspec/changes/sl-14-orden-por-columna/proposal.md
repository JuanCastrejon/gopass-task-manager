# Proposal: SL-14 — Orden de tareas configurable por columna

## Why

El orden dentro de una columna era fijo: `priority DESC, created_at DESC`. Es un criterio razonable
y sirve para la cola de entrada, pero no para el resto del tablero. Cada etapa se lee con una
pregunta distinta:

- En la cola de entrada interesa **qué tomar a continuación** — prioridad alta primero.
- En el trabajo en curso interesa **qué lleva más tiempo atascado** — las más antiguas primero.
- En el archivo interesa **lo recién terminado** — las más recientes primero.

Un criterio único para todo el tablero obliga a un compromiso en las tres, y ninguna queda bien.

## What Changes

- **WP1 — `project_columns.sort` (`0005`):** `ENUM column_sort` con cuatro criterios, por defecto
  el histórico.
- **WP2 — Orden en SQL:** escalera de `CASE` sobre `pc.sort` en la consulta del listado.
- **WP3 — Selector en la cabecera de cada columna.**
- **WP4 — Verificación:** pruebas de integración y cobertura E2E de la persistencia.

## Capabilities

### Modified Capabilities
- `board-columns` — la columna gana su criterio de orden.
- `tasks-api` — el listado ordena por el criterio de cada columna.

## Decisiones con su porqué

**El orden vive en la columna, no en el navegador.** Se descartó `localStorage`, que era la
propuesta de una de las dos revisiones: no se comparte por enlace, no sobrevive a cambiar de equipo
y contradice ADR-019, que fijó que el estado del tablero vive en un sitio compartible. Las columnas
ya son configuración del equipo; su orden también lo es.

**Un criterio por columna, y aun así una sola consulta.** La otra revisión sostenía que un orden por
columna exigiría N peticiones o penalizar la caché de consultas, y que por eso debía haber un único
selector para todo el tablero. **Se midió y es falso:**

```
col 1 | priority_desc | HIGH, MEDIUM, LOW
col 2 | created_asc   | ene 1, ene 2, ene 3
col 3 | priority_asc  | LOW, MEDIUM, HIGH
```

Una escalera de `CASE` sobre `pc.sort` deja en NULL todas las ramas salvo la del criterio activo de
esa columna, así que solo una tiene efecto. Ni N consultas ni ordenación en cliente, que además
sería justo lo que RF-13 prohíbe para los filtros.

**Desempate estable.** El orden termina en `created_at DESC, t.id` para que dos cargas seguidas no
intercambien tarjetas cuando el criterio elegido empata.

**Cuatro criterios y no seis.** No se ofrece orden alfabético por título: no responde a ninguna
decisión de trabajo y solo añadiría relleno al selector.

## Exclusiones de alcance

- **Orden manual arrastrando dentro de la columna.** Sigue fuera; ver `sl-11`.
- **Preferencia personal de orden por usuario.** Exigiría identidad, que el producto no tiene.
- **Orden por campos que no existen** —responsable, fecha de vencimiento, etiquetas—.

## Impact

Cambio aditivo: una columna sin tocar conserva el criterio histórico y el tablero se comporta igual
que antes.

## Perfil de Readiness

`L1` (Presentational) en la interfaz, con un cambio de esquema aditivo y reversible detrás.

## Viabilidad y esfuerzo

- **Esfuerzo:** S
- **Riesgo técnico:** bajo — el SQL está verificado contra el motor con tres criterios simultáneos.
- **Riesgo funcional:** bajo — el valor por defecto reproduce el comportamiento anterior.

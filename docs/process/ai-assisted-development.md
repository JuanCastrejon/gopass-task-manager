# Desarrollo asistido por IA

Este proyecto se desarrolló con asistencia de IA bajo revisión humana explícita: las decisiones de alcance, modelo de datos, contrato de API y arquitectura se especificaron por escrito **antes** de generar código, y la responsabilidad sobre el resultado es del autor.

## Cómo se trabajó

El orden importa más que la herramienta:

```
requisitos y alcance  →  modelo de datos  →  contrato de API  →  implementación  →  verificación
        (humano)            (humano)            (humano)          (asistida)        (medida)
```

Lo que quedó escrito antes de la primera línea de código está en [`docs/spec/`](../spec/): requisitos con criterios de aceptación, la lista de lo descartado **con su razón**, el DDL con sus invariantes y el catálogo de errores. La IA aceleró la implementación y la redacción; no eligió el alcance ni el modelo.

## Qué se verificó, y cómo

Ninguna afirmación técnica de este repositorio se apoya en lo que un modelo dijo. Las que decidieron el diseño se comprobaron contra PostgreSQL 16 en ejecución, y están documentadas con su salida literal en [`08-verificacion-postgres.md`](../spec/08-verificacion-postgres.md):

- **Los dos casos de `SQLSTATE 23503` son indistinguibles** por `code`, `constraint`, `table`, `schema` y `routine`. Esa medición es la que movió la traducción de errores desde un módulo genérico hasta cada repositorio.
- **`ALTER TYPE ... ADD VALUE` sí funciona dentro de una transacción** desde PostgreSQL 12. La creencia contraria —que circula mucho— habría justificado mal la elección de `ENUM`. El límite real es otro: no se puede retirar un valor.
- **`WHERE status = ANY($1)` no necesita cast** desde el driver `pg`. El error que sí aparece es un artefacto de `PREPARE` en psql, no del driver.
- **`react-router-dom` cuesta +13.4 KB gzip** en este bundle, no los ~300 KB que se repiten por ahí. Se midió instalándolo y comparando builds antes de decidir no usarlo.

Cuando dos herramientas dieron consejos opuestos, el desempate no fue por mayoría: se reprodujo el caso. El consenso entre modelos no es evidencia.

## Auditoría antes de entregar

Antes del bloque de estabilización se hizo una revisión adversarial: en vez de «repasar la interfaz», se pidió una **predicción de qué estaba roto** a partir de la arquitectura. Ocho de esas apuestas resultaron ciertas y **cada una se reprodujo antes de tocar nada**. Entre ellas:

- Nueve `<dialog>` en el documento con `id` repetidos, de modo que cinco etiquetas `<label for>` resolvían al mismo campo.
- Un temporizador de búsqueda rancio que borraba el filtro de prioridad 250 ms después de aplicarlo.
- Una respuesta que no fuera JSON —el 504 que devuelve nginx con la API caída— reventaba con `SyntaxError` fuera del `try`.

El detalle, con la evidencia de cada una, está en [`05-estrategia-calidad.md`](../spec/05-estrategia-calidad.md).

## El contrato de calidad en CI

El repositorio usa [`sistema-multiagente-sdlc`](https://www.npmjs.com/package/sistema-multiagente-sdlc), una herramienta open source (MIT) de la que soy autor, **en su modo mínimo**: `adopt` añade cuatro archivos de contrato y una `devDependency`, frente a los 286 archivos que instala el modo completo. Meter el andamiaje entero en una aplicación de dos tablas habría sido exactamente el error para este volumen de aplicación.

Lo que aporta en la práctica es un paso de CI que adjudica el contrato de calidad después de las pruebas. Su comportamiento actual es deliberado y conviene entenderlo:

- Sobre un cambio que toca `api/src`, mide de verdad: **99.01 % de 202 líneas cambiadas**.
- Sobre un cambio que no toca esa superficie, sale `vacuous` con el motivo escrito, **en lugar de dar un verde que no ha medido nada**.
- Los controles de dependencias y de mutación están declarados `unavailable` con su razón, así que salen `not-applicable` y no `not-measured`.

Esa distinción es el punto: **no medido e incumplido no son lo mismo**, y bajar un umbral para que un check pase es teatro. La aplicación no depende de la herramienta en tiempo de ejecución; si se quita la `devDependency`, compila, arranca y funciona igual.

## Límites de este enfoque

La asistencia acelera la escritura; no sustituye conocer el dominio ni el motor. Las tres o cuatro decisiones que de verdad definen este proyecto salieron de medir PostgreSQL, no de preguntar. Y una parte del trabajo de este repositorio —la auditoría, las mediciones, el recorte de alcance— consistió precisamente en **no** aceptar lo primero que se propuso.

## Evidencia

| | |
|---|---|
| Historial | 10 commits, cada uno con su razonamiento en el mensaje |
| Pruebas | 78 · 93.8 % de cobertura del backend funcional |
| Reproducibilidad | `docker compose up --build` verificado desde clon limpio en cada bloque |
| Mediciones | [`08-verificacion-postgres.md`](../spec/08-verificacion-postgres.md) |
| Decisiones | 20 ADRs en [`04-arquitectura.md`](../spec/04-arquitectura.md) |

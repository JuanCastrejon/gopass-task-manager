# Especificación técnica

Estos documentos se escribieron **antes** del código y se corrigieron cuando una medición contra el motor contradijo lo que decían. No son un informe posterior: son el material con el que se construyó.

Si tiene poco tiempo, el [README](../../README.md) resume lo esencial y estas son las dos paradas que más rápido enseñan el criterio detrás del proyecto:

1. **[08 · Verificación de PostgreSQL](08-verificacion-postgres.md)** — las mediciones que decidieron el modelo de datos, con su salida literal.
2. **[04 · Arquitectura](04-arquitectura.md)** — los 21 ADRs, cada uno con sus alternativas descartadas.

## Ruta de lectura completa

| | | |
|---|---|---|
| **01** | [Requisitos](01-requisitos.md) | RF-01…RF-16 y RNF-01…RNF-10 con criterios de aceptación, casos de uso y la lista de lo descartado **con su razón** |
| **02** | [Modelo de dominio](02-modelo-dominio.md) | DDL completo, por qué `ENUM` y no `text`, la invariante de estado terminal y quién la satisface |
| **03** | [Contrato de API](03-contrato-api.md) | Los 11 endpoints, el formato RFC 7807, el catálogo de códigos y el mapeo `SQLSTATE`→HTTP |
| **04** | [Arquitectura](04-arquitectura.md) | Las tres capas de validación, la estructura de carpetas y los 21 ADRs |
| **05** | [Estrategia de calidad](05-estrategia-calidad.md) | Dónde se invierte el presupuesto de pruebas, el aislamiento por worker, el pipeline de CI, los quality gates y la matriz de trazabilidad |
| **08** | [Verificación de PostgreSQL](08-verificacion-postgres.md) | Nueve secciones de mediciones contra PostgreSQL 16.15 y qué cambió en la especificación por cada una |

La numeración salta del 05 al 08: los documentos 06 y 07 eran el cronograma de ejecución y el guion de preparación personal, y no forman parte de la entrega.

## Cómo leer esto

Cada decisión sigue la misma forma: **contexto**, **decisión**, **alternativas descartadas** y **consecuencia**. Las alternativas importan tanto como la elección; varias de ellas se descartaron después de medirlas, no antes.

Cuando un documento afirma algo sobre el comportamiento de PostgreSQL o del driver, hay una medición detrás en el documento 08 con la salida real del motor. Ese fue el criterio: nada que se pueda comprobar se deja en «creo que».

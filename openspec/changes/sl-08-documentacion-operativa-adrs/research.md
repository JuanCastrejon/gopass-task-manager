# Research: SL-08 — Especificaciones Técnicas, ADRs y Gobernanza

## 1. Importancia de los ADRs (Architectural Decision Records)
El registro de decisiones de arquitectura no solo describe la opción elegida, sino especialmente el contexto y las alternativas descartadas. Decisiones críticas como rechazar el borrado en cascada en favor de HTTP 409 con `ON DELETE RESTRICT`, o desambiguar `SQLSTATE 23503` en la capa de repositorio en vez de un middleware genérico, son el núcleo de la solidez del sistema.

## 2. Documentación como Código
Mantener las especificaciones dentro del repositorio en Markdown y la colección `docs/api.http` versionada junto al código fuente garantiza que la documentación evolucione a la par del software, previniendo la degradación del conocimiento del dominio.

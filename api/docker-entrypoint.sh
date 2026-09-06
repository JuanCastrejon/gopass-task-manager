#!/bin/sh
set -e

# Compose ya espera a que PostgreSQL esté `service_healthy`, pero ese
# healthcheck confirma que el motor acepta conexiones, no que este contenedor
# pueda autenticarse. Se reintenta un número acotado de veces en vez de
# asumirlo.
# Se usa `--no-single-transaction` para que cada archivo de migración corra
# en su propia transacción (0006 confirma el ENUM antes de que 0007 lo use en SET DEFAULT).
echo "[api] aplicando migraciones"
i=1
until ./node_modules/.bin/node-pg-migrate --no-single-transaction up; do
  if [ "$i" -ge 10 ]; then
    echo "[api] las migraciones fallaron tras $i intentos" >&2
    exit 1
  fi
  echo "[api] migración fallida (intento $i), reintentando en 2s"
  i=$((i + 1))
  sleep 2
done

# El seed es dato de demostración, no esquema: se activa explícitamente.
# Y si falla, el arranque falla. Tragarse el error dejaría la aplicación
# abierta en blanco sin que nadie sepa por qué.
if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "[api] sembrando datos de demostración"
  node dist/db/seed.js
fi

echo "[api] arrancando servidor"
exec node dist/server.js

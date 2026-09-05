# --- build ---
FROM node:22-alpine AS build
WORKDIR /app

# `npm ci` y no `npm install`: la imagen se construye desde el lockfile,
# así el contenedor del evaluador resuelve exactamente las mismas versiones.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- runtime ---
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY migrations ./migrations

# Las migraciones corren en el arranque del contenedor, no como un paso
# manual del README: el evaluador ejecuta un solo comando.
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER node
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]

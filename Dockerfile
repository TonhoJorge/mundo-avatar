# syntax=docker/dockerfile:1
# Mundo Avatar — imagem de produção.
# Etapa 1 gera o site e os tiles do mapa (pesado, só no build).
# Etapa 2 é só um nginx sem privilégios servindo arquivos estáticos (leve).

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Zoom máximo dos tiles: 6 = alta resolução (~150 MB). Use 5 para um build mais rápido/leve.
ARG MAX_ZOOM=6
RUN npm run build \
 && node tools/render-world.mjs --max-zoom "${MAX_ZOOM}" --out dist \
 && node tools/import-art.mjs --auto --out dist

FROM nginxinc/nginx-unprivileged:1.28-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1

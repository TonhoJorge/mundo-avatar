# syntax=docker/dockerfile:1
# Mundo Avatar — imagem de produção.
# O mapa (tiles) é gerado no build e só é refeito quando a geografia, o catálogo
# de lugares ou a arte mudam. Mudanças só no app reaproveitam o cache.
# A imagem final é só um nginx sem privilégios servindo arquivos estáticos.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# --- tiles do mapa (etapa pesada) ---
FROM deps AS tiles
COPY world/ world/
COPY tools/render-world.mjs tools/import-art.mjs tools/
COPY public/data/places.json public/data/places.json
# Zoom máximo: 6 = alta resolução (~150 MB). Use 5 para um build mais rápido e leve.
ARG MAX_ZOOM=6
RUN node tools/render-world.mjs --max-zoom "${MAX_ZOOM}" --out /out
# arte oficial opcional (arte/<era>.jpg|png|webp), ver docs/ARTE-OFICIAL.md
COPY arte/ arte/
RUN node tools/import-art.mjs --auto --out /out

# --- aplicação web ---
FROM deps AS app
COPY . .
RUN npm run build

# --- servidor ---
FROM nginxinc/nginx-unprivileged:1.28-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=app /app/dist /usr/share/nginx/html
COPY --from=tiles /out/ /usr/share/nginx/html/
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1

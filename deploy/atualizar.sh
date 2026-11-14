#!/usr/bin/env sh
# Atualiza o código e reconstrói a instância. Rode na pasta do projeto, no servidor.
set -eu
git pull --ff-only
docker compose up -d --build
docker image prune -f >/dev/null
docker compose ps

#!/bin/sh
set -e

echo "→ Rodando migrations do Prisma..."
node node_modules/.bin/prisma migrate deploy

echo "→ Iniciando app..."
exec node server.js

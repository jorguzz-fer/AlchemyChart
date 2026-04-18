#!/bin/sh
set -e

echo "→ Rodando migrations do Prisma..."
node node_modules/prisma/build/index.js migrate deploy

echo "→ Iniciando app..."
exec node server.js

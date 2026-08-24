#!/bin/sh
set -e

# Apply the database schema before starting the server.
# Prefer committed migrations (prisma migrate deploy). If none exist yet
# (e.g. first bring-up), fall back to `prisma db push` to sync the schema.
if [ -d prisma/migrations ] && [ -n "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  echo "[entrypoint] Applying migrations (prisma migrate deploy)..."
  npx prisma migrate deploy
else
  echo "[entrypoint] No migrations found — syncing schema (prisma db push)..."
  npx prisma db push --skip-generate
fi

echo "[entrypoint] Starting: $*"
exec "$@"

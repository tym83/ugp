#!/usr/bin/env bash
# Одношаговый деплой UGP на чистый Ubuntu-сервер (reg.ru Облачный сервер).
# Ставит Docker (если нет), генерирует .env с секретами, поднимает стек
# (PostgreSQL + приложение + Caddy c авто-HTTPS), выполняет первичный сид админа.
#
# Запуск из корня репозитория после git clone:
#   DOMAIN=grappling74.ru bash deploy/bootstrap.sh
# Первичный сид создаёт демо-аккаунты (пароль demo) + событие Танкоград, если БД пустая.
#
# Повторный запуск безопасен: существующий .env не перезаписывается
# (секреты и пароль БД сохраняются), стек пересобирается и обновляется.
set -euo pipefail

# ---- перейти в корень репозитория (скрипт лежит в deploy/) -------------------
cd "$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(pwd)"
COMPOSE_FILE="deploy/docker-compose.prod.yml"

# ---- проверка обязательных параметров (нужны только при первой генерации .env)
if [ ! -f .env ]; then
  : "${DOMAIN:?нужно передать DOMAIN=...}"
fi

# ---- Docker + compose plugin -------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  echo "[bootstrap] Устанавливаю Docker..."
  curl -fsSL https://get.docker.com | sh
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "[bootstrap] Ставлю docker compose plugin..."
  apt-get update -y && apt-get install -y docker-compose-plugin
fi

# ---- генерация .env (только если отсутствует) --------------------------------
if [ ! -f .env ]; then
  echo "[bootstrap] Генерирую .env с секретами..."
  PG_PASS="$(openssl rand -hex 24)"
  SESSION_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
  cat > .env <<EOF
DOMAIN=${DOMAIN}
POSTGRES_USER=ugp
POSTGRES_PASSWORD=${PG_PASS}
POSTGRES_DB=ugp
DATABASE_URL=postgresql://ugp:${PG_PASS}@db:5432/ugp?schema=public
SESSION_SECRET=${SESSION_SECRET}
EOF
  chmod 600 .env
  echo "[bootstrap] .env создан (chmod 600)."
else
  echo "[bootstrap] .env уже есть — оставляю как есть."
fi

# ---- сборка и запуск стека ---------------------------------------------------
echo "[bootstrap] Сборка и запуск стека (может занять несколько минут)..."
docker compose --env-file .env -f "$COMPOSE_FILE" up -d --build

# ---- первичный сид (идемпотентный): админ + событие-заготовка -----------------
echo "[bootstrap] Первичный сид (админ + событие DRAFT)..."
docker compose --env-file .env -f "$COMPOSE_FILE" --profile tools run --rm seed || \
  echo "[bootstrap] сид пропущен/не критичен (возможно, уже выполнен)"

echo
echo "[bootstrap] Готово."
echo "  Домен:      https://$(grep '^DOMAIN=' .env | cut -d= -f2)"
echo "  Контейнеры: docker compose --env-file .env -f $COMPOSE_FILE ps"
echo "  Логи app:   docker compose --env-file .env -f $COMPOSE_FILE logs -f app"
echo "  Проверь, что A-запись домена указывает на этот сервер — Caddy сам выпустит TLS."

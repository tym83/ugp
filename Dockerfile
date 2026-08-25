# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# Multi-stage build for Next.js 16 standalone output.
# Prod runs on PostgreSQL — DATABASE_URL must be supplied at runtime.
# The entrypoint applies the schema (migrate deploy, db push fallback) then
# starts the standalone server.
# ─────────────────────────────────────────────────────────────────────────────

ARG NODE_VERSION=22-alpine

# ---------- deps: install full dependencies (incl. dev, needed for build) ----
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
# libc compat for Prisma engines on Alpine
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json* ./
RUN npm ci

# ---------- build: generate Prisma client + compile Next ---------------------
FROM node:${NODE_VERSION} AS build
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prod runs on PostgreSQL. The committed schema is sqlite (for local dev);
# flip the datasource provider for the image build so the generated client,
# migrations and runtime db push all target Postgres.
RUN sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma
# Prisma client must be generated before the Next build.
RUN npx prisma generate
# DATABASE_URL is not needed to build; provide a dummy so any import-time reads
# don't fail. Real value is injected at runtime.
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="postgresql://user:pass@localhost:5432/build?schema=public"
RUN npm run build

# ---------- runner: minimal standalone runtime ------------------------------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Non-root user (node's built-in "node" uid/gid 1000 exists on the base image).
# Standalone server output.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# Prisma needs the schema + CLI + generated client to run migrations at start.
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/prisma ./node_modules/prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh && chown -R node:node /app

USER node
EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]

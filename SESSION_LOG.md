# Session log — ugp (started 2026-06-27, resumed 2026-08-24)

## Цель
Полноценно реализовать платформу турниров по грэпплингу (событие «Андеграунд Грэпплинг
Танкоград», 22.11.2026, Челябинск). Локально → тесты → прогон ролей → ревью → деплой на reg.ru.
Без срезания MVP.

## Текущее состояние
- Стек: Next.js 16 (App Router, src), Prisma 6 (SQLite локально → Postgres прод), Tailwind, cookie-auth.
- Доменное ядро (bracket/pricing/eligibility/merge/teamscore/results/audit) написано, 18 unit-тестов зелёные.
- Прогнаны 10 фоновых агентов: 5 сценариев по ролям (coach/participant/admin/organizer/referee) +
  5 ревью (UX / web-dev / marketer / QA / security-152ФЗ). Все отчёты получены и сведены ниже.
- Идёт фаза исправлений: сперва security+correctness core (я), затем additive-поверхности (агенты).

## Следующий шаг
Дождаться 4 фоновых агентов (organizer-flows / participant-public / admin / infra),
интегрировать, прогнать tsc+vitest+build, коммит. Затем WS-5: integration+e2e тесты.

## Core-фиксы — СДЕЛАНО (ветка fix/review-security-correctness, коммит 63d773f)
- Подписанная HMAC-сессия (SESSION_SECRET, TTL, secure) + requireRole guard.
- RBAC на server actions; refereeUserId из сессии; /api/{build,result} → POST+роль.
- togglePaid IDOR (updateMany where coachUserId); registerGroup: роль+REG_OPEN+дедуп.
- advanceWinner в транзакции + guard null-фидера (BYE→бронза больше не null).
- buildBracket в транзакции + запрет пересборки поверх finalized.
- submitResult: P2002 → идемпотентный успех.
- eligibility play-up только в ближайшую старшую; nativeCategory fallback (перевес юниоров).
- judge page role-guard + RU-лейблы winType + score-поля; package.json scripts + prisma.seed.
- tsc чисто, 18/18 unit-тестов зелёные.

## Файловые владения фоновых агентов (без пересечений)
- WS-1 organizer-flows: src/app/organizer-actions.ts, organizer/**, standings/**, lib/domain/placement*.
- WS-2 participant-public: layout, page, event/[id], category/[id], register/**, me/**,
  athlete-actions.ts, coaches/**, sponsors/**, sitemap/robots, components/**.
- WS-3 admin: src/app/admin/**, admin-actions.ts, lib/data/preset.ts, tankograd.ts, prisma/seed.ts.
- WS-4 infra: prisma/schema.prisma (indexes only), next.config.ts, Dockerfile, .dockerignore,
  .env.example, .github/workflows/ci.yml.

## Консолидированный бэклог (из 10 агентов), по приоритету

### BLOCKER — безопасность (security + web-dev агенты)
- [ ] session.ts: cookie хранит сырой userId → подпись HMAC (SESSION_SECRET), TTL, secure. 
- [ ] /api/{build,result,matches}: анонимны, GET-мутации (build стирает результаты!, result пишет
      победителя без auth) → RBAC + убрать/закрыть GET-мутации.
- [ ] server actions (buildBracketAction/submitResultAction/togglePaidAction): нет проверки ролей;
      refereeUserId берётся из формы, не из сессии; togglePaid — IDOR (нет coachUserId в where).
- [ ] consent/152-ФЗ: registerGroup заводит ПДн (в т.ч. детей) без Consent/parentConsent.

### BLOCKER/CRITICAL — критический путь дня Х (organizer/admin/QA агенты)
- [ ] Взвешивание ENTERED→WEIGHED→ADMITTED + actualWeight + рекатегоризация + WEIGH-IN LOCK.
      Сейчас ADMITTED пишет только сид → без этого сетка пустая.
- [ ] Применение merge (mergedIntoId + effectiveCategoryId), инвариант «до GENERATED/frozenAt».
- [ ] Командный зачёт: computeTeamScores не вызывается; агрегация мест из результатов отсутствует.
- [ ] Admin/organizer слой: создание события/категорий/тиров через UI (сейчас только seed,
      деструктивный), управление пользователями/ролями, назначение судей на ковры, смена статусов.

### CRITICAL — корректность сеток/результатов (referee/QA/web-dev)
- [ ] BYE-полуфинал → бронза получает null-слот (advanceWinner пишет loserAthleteId! = null).
- [ ] advanceWinner вне транзакции + пересборка buildBracketForCategory без guard стирает Result.
- [ ] P2002 при гонке одинакового clientMutationId → 500 вместо идемпотентного ответа.
- [ ] eligibility play-up слишком широк (ребёнок → в adults); nativeCategory без fallback → tren
      overweight-юниор ловит hard-error вместо предложения play-up/ближайшей.

### HIGH — участник/публичная поверхность (participant/UX/marketer)
- [ ] Self-registration атлета (роут /register) — сейчас только через тренерский грид.
- [ ] «Моя следующая схватка» /me: ковёр, ETA, соперник, автообновление.
- [ ] Поиск атлета/клуба; live-обновление (poll 5–10с); мобильный «путь атлета».
- [ ] SEO/OG/lang=ru (сейчас «Create Next App», lang=en), sitemap/robots, generateMetadata.
- [ ] Лендинг-герой + CTA + countdown; страница тренеров (инсентив 200₽ + зачёт 30/20/10к);
      публичный командный зачёт; страница спонсоров; share сеток.

### HIGH — судейство (referee агент)
- [ ] Правка результата гл. судьёй (supersededById не используется); confirm+undo; офлайн-индикатор.
- [ ] score/penalty в форме (отбрасываются); overtime/пенальти при ничьей.
- [ ] winType русские лейблы; спец-исходы (DQ/неявка/травма) за доп. подтверждение + каскад медалей.

### MED/HIGH — prod-readiness (web-dev/security)
- [ ] Postgres provider (сейчас hardcoded sqlite; Float веса → Decimal), migrate deploy.
- [ ] Dockerfile + output:standalone + .dockerignore + .env.example + SESSION_SECRET + env-валидация.
- [ ] package.json скрипты test/seed/migrate/typecheck; prisma.seed; CI .github/workflows.
- [ ] Zod-валидация входов registerGroup; проверка event.status===REG_OPEN.
- [ ] Индексы @@index([categoryId,status]) и др.; security-заголовки (CSP/HSTS); rate-limit логина.

### Интеграционные/e2e тесты (QA)
- [ ] Vitest integration (Prisma): submitResult идемпотентность/lock, BYE-цепочки, rebuild-guard,
      registerGroup, weigh-in, merge. Playwright e2e happy-path (coach→build→judge→bronze→standings).

## Журнал

### 08:XX — Все 10 агентов завершены, бэклог сведён
- Получены отчёты 5 сценариев + 5 ревью. Сильная конвергенция: security-дыры, отсутствие
  admin/participant-слоёв, разрозненность критического пути дня Х, пара реальных багов сеток.
- Внесён дедуп атлетов в registerGroup (повторная заявка не плодит дубликаты).
- Далее: core-фиксы (security+correctness), затем additive-поверхности агентами.

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

## Следующий шаг (для следующей сессии)
Hardening до go-live на reg.ru (см. «Осталось» ниже). Ближайшее: Postgres-провайдер +
миграции, интеграционные тесты с БД (закоммитить smoke как тест), Playwright e2e, rate-limit,
152-ФЗ ops (уведомление РКН + политика), referee-коррекция результата (supersededById).

## СТАТУС: платформа собрана и проверена локально ✅
- Ветка `fix/review-security-correctness`, 7 коммитов поверх scaffold. НЕ смёржено в main, НЕ запушено.
- `npx tsc --noEmit` чисто; `vitest` 24/24 (18 доменных + 6 placement); `next build` 22 роута;
  seed создаёт событие + 255 категорий; `next start` поднимается.
- E2E доменный smoke (scratchpad/ugp-smoke.ts): build→play→advance→бронза(0 null)→места(1/2/3)→
  командный зачёт — OK на сид-данных.
- HTTP smoke (next start :3123): все публичные роуты 200; под admin-cookie все ролевые роуты 200;
  без куки /admin,/coach → 307 на логин; поддельная кука → 307 (отклонена);
  POST /api/{result,build} без auth → 401; GET /api/result → 405.

## Реализовано в этой сессии
- Security core: подписанная HMAC-сессия+TTL+secure; requireRole; RBAC на actions и API;
  судья из сессии; /api/{build,result} POST-only+роль; togglePaid IDOR; registerGroup роль+REG_OPEN+дедуп.
- Correctness: advanceWinner в транзакции + guard null-фидера (бронза); buildBracket в транзакции
  + запрет пересборки поверх finalized; P2002→идемпотентно; play-up только ближайшая старшая +
  fallback для перевеса; standings final по кругу (не по positionInRound).
- Organizer: взвешивание→допуск→рекатегоризация, WEIGH-IN LOCK (REG_CLOSED→LIVE), applyMerge
  (инвариант до генерации), placement + публичный командный зачёт с призами 30/20/10к, консоль.
- Admin: preset-билдер (seed на нём), CRUD событий/тиров/категорий, пользователи/роли,
  назначение судей на ковры, forward-only статусы.
- Participant/public: self-registration + согласие 152-ФЗ (+родительское для <18), /me с ETA,
  поиск, live-polling, SEO/OG lang=ru, лендинг+countdown, страницы тренеров/спонсоров.
- Infra: индексы, next.config standalone+CSP/HSTS, Dockerfile+entrypoint, .env.example, CI.

## Доделано в сессии 2026-08-25 (ветка feat/finish-functional)
- Коррекция результата гл. судьёй (correctResult): supersede-через-аудит, пере-продвижение
  в PENDING-зависимые, запрет если зависимый матч уже сыгран; confirm-before-submit в пульте.
- Ручная правка сетки: swapSeeds/moveAthleteSeed/resolveConflict + поиск конфликтов
  (одноклубники/однофамильцы в 1 круге), инвариант «только до реального результата».
- Абсолютка on-site: addToAbsolute (+ surcharge) + отдельная кнопка generateAbsoluteBracket.
- xlsx-импорт группы в тренерский грид (RU/EN заголовки, xlsx@0.18.5).
- Интеграционные тесты (Prisma/SQLite, 7 шт.): BYE без null-бронзы, идемпотентность/
  иммутабельность/guard-участника submitResult, rebuild-guard, correctResult + отказ каскада.
  Отдельный vitest.integration.config.ts; добавлен шаг в CI.
- Проверка: tsc чисто · unit 24/24 · integration 7/7 · build 23 роута.

## Доделано в сессии 2026-08-25 #2 (ветка feat/prod-hardening)
- Rate-limit: fixed-window, логин 10/5мин (IP+email), API build 30/мин, result 120/мин → 429.
- 152-ФЗ: маскирование ФИО несовершеннолетних на публичных страницах + /api/matches;
  страница политики /privacy + ссылки. Staff-страницы — полные имена.
- Referee/UX: overtime/пенальти в BoutForm (в details, читается сервером), online/offline+sync
  индикатор; app-level loading/error/not-found; мобильный «путь атлета» на /me.
- Playwright e2e (4 теста, изолированная e2e.db): публичные страницы, вход тренера/админа,
  редирект без авторизации. Скрипты test:e2e/test:integration; CI-джоба e2e.
- Проверка: tsc чисто · unit 24/24 · integration 7/7 · e2e 4/4 · build 24 роута.

## Осталось (до go-live) — приоритет
- Postgres provider + миграции (решено: deploy-time на reg.ru; локаль остаётся SQLite),
  Float веса→Decimal, бэкапы/логи в РФ.
- 152-ФЗ ops (нетехнические): уведомление РКН, наполнение политики контактами оператора.
- Overtime/пенальти — доменный подсчёт при ничьей (сейчас пишется в details, без авто-решения).
- Глубокая UI-полировка merge/weigh-in экранов; офлайн-очередь судьи (не только индикатор).

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

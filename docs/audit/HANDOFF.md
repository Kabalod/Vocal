# Передача состояния работы (05.10.2026, ~18:00 UTC)

Файл для нового терминала/сессии. Источник правды по этапам — отчёты `docs/audit/S1_REPORT.md`, `S2_REPORT.md`, `S3_REPORT.md`, `S4_REPORT.md` и `S0_DECISIONS.md`.

## Ветки (цепочка, каждая от предыдущей; в `main` ничего не слито, PR не создавались)

`fix/c00-live-action-shape` (база `0066469`) → `feat/s1-ai-gateway` (`c11118f`) → `feat/s3-entry-cleanup` (`1fdedec`) → `feat/s2-data-deletion` (`a15ad85`) → `feat/s4-operations` (`753993d`, сейчас).

Порядок слияния: S1 → S3 → S2 → S4. Работать нужно на `feat/s4-operations`.

## Что открыто

1. **CI красный на `feat/s4-operations`** (вкладка Actions; логи без токена недоступны, упавшие тесты выводятся аннотациями шага «Report failed tests»). Известно: тест `disabled C00 policy…` падал из-за shallow-клона (исправлено `fetch-depth: 0`); тест `two executors of one turnKey call complete once` — старый флак (~25 % на базе `0066469`), после правки в `src/lib/dialogue.ts` ~17 %; 2 оставшихся падения не разобраны.
2. **Docker**: образ собран и запущен (HEALTHCHECK, SIGTERM, том) — см. S4_REPORT; найден и исправлен дефект openssl. Не проверено: остановка во время активного задания, `npm run test:postgres` штатным способом через Docker Postgres.
3. S5 (приёмка закрытого запуска) не начат: E2E по экранам 01–09, два пользователя, прогон на живой модели (бюджет и разрешение владельца), регистрация и письма на живой среде (SMTP не выбран, S0.5).
4. Не проверялось (см. отчёты): живой Supabase (`auth.admin.deleteUser`, `public.profiles`, бакет), upload-дефект на Windows, Docker-образ.

## Окружение разработки

Всё в домашнем каталоге; `/tmp` — tmpfs на 2 ГБ, **большие файлы туда не класть** (из-за этого падал Postgres).

```bash
source ~/vocal-dev/env.sh        # PATH с Node 22 (~/.local/node), NODE_ENV=test, TEST_DATABASE_URL
~/vocal-dev/start-pg.sh          # встроенный Postgres 18 на 127.0.0.1:54329 (данные ~/pgdata/data)
cd ~/Vocal && npm ci             # если нужно
```

- Типы и сборка: `npx tsc --noEmit`; `npx next lint`; полная сборка как в CI:
  `DATABASE_URL='postgresql://postgres:build@db.zfbiyyhedhqdgrxxajrj.supabase.co:5432/postgres' DIRECT_URL=$DATABASE_URL NEXT_PUBLIC_SUPABASE_URL=https://zfbiyyhedhqdgrxxajrj.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=x npx next build`.
- Тесты без Docker (то, что делает `scripts/test-postgres.cjs`, но на встроенном Postgres): `npx tsx --test --test-concurrency=1 tests/<файл>.test.ts`. Полный набор ≈ 8 мин (398 тестов, все зелёные на `d2c93b1`). Список файлов — из `scripts/test-postgres.cjs` (все `tests/*.test.ts`, кроме `*live*`); `tests/runner-coverage.test.ts` проверяет, что новые тесты в него добавлены.
- Браузерные E2E: Playwright + Chromium в `/tmp/claude-1000/.../scratchpad/e2e` (может исчезнуть; ставится заново: `npm i playwright && npx playwright install chromium`). Приложение для E2E — production-сборка с `VOCAL_UI_TEST_DB=1 TEST_DATABASE_URL=<схема> VOCAL_AI_MOCK=1 VOCAL_STT_MOCK=1`; схема создаётся `openPostgresTestDb()` из `tests/helpers/postgres-test-db.ts`.
- Бэкап-скрипты проверялись на Postgres 16 из pip-пакета `pgserver` (`pg_dump` 16.2; сервер 18 из встроенного пакета с ним несовместим).

## Правила, которые нельзя нарушать (из `docs/audit/STAGES.md`)

Не трогать live Supabase, не применять `migrate`/baseline/`resolve`, не запускать платные модели без разрешения владельца, не читать `.env`, не объявлять приёмку и не менять статусы в ROADMAP/AGENTS. Новые миграции — только описать, не применять.

## Известные ловушки

- `pkill -f <шаблон>` убивает собственный shell, если шаблон есть в тексте команды: убивать по PID.
- `next dev` деградирует при большом числе мыслей в схеме; E2E гонять на production-сборке.
- `router.refresh()` сразу после `router.push` ломает переход (убран в `NewThoughtSheet`).

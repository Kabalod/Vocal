# Передача состояния работы (обновлено 08.10.2026)

> Работа ведётся цепочкой веток `fix/c00-live-action-shape` → `feat/s1-ai-gateway` → `feat/s3-entry-cleanup` → `feat/s2-data-deletion` → `feat/s4-operations` (здесь же R1–R5) → `docs/cards-research` (K1–K3). Цепочка линейная, конфликтов с `main` нет (проверено слиянием в отдельном рабочем дереве). Порядок слияния: S1 → S3 → S2 → S4 → R → K-docs. PR в `main` не создавались; текст — `docs/audit/PR_DRAFT.md`. Источники: `STAGES.md` (статусы сверены с отчётами), `STAGE_CYCLE.md` (R), `STAGE_CARDS.md` (K), отчёты `S*_REPORT.md`, `R_REPORT.md`, `R5_REPORT.md`, `K_REPORT.md`. Принятых этапов нет: S1–S5, R, K — кандидаты.

## Состояние

| Этап | Состояние |
|---|---|
| S1–S4 | кандидаты, отчёты есть |
| S5 | кандидат, не принят. Блокеры закрытого запуска: **лимит провайдера Groq 200 000 токенов в сутки на аккаунт** (для нескольких авторов не хватит), **SMTP не выбран**, живой Supabase не проверен (`S5_REPORT.md`, раздел «Блокеры») |
| R1–R4 | в коде и тестах: основа `from_take` (хранится, не показывается), диагностика дубля с типами пробелов, защита текста автора от служебных id, невалидная часть ответа модели отбрасывается и считается, понижение действий вместо падения хода, возврат с фразой на невалидный `redirect_to_task`, проверка повторов вопросов, сборка с «что изменено», интерфейс R4 проверен в браузере (8/8) |
| R5 | измерение выполнено, не принято: механика пройдена, критерий оффтопа (два живых примера) не пройден; причина оффтоп-ошибок подтверждена и исправлена; живая перепроверка оффтопа и повторов — **один раз завтра после сброса суточного лимита, не больше 40 тыс. токенов в сутки на проверки** |
| K | K0 в коде; K1–K3 готовы (`docs/cards-research`, `K_REPORT.md`): кандидатов 2 (сузить категоричное; один конкретный случай), гипотез 10; **K4 не трогать (ноль карточек)**, K5 только после слова владельца |

## Офлайн-инструменты (без провайдера)

- Набор «плохие ответы модели»: `tests/fixtures/bad-model-answers/` (14 реальных форм поломок) и `tests/bad-model-answers.test.ts`.
- Стенд «Claude как модель»: `docs/audit/RECORDED_STAND.md`, `tests/recorded/`, `tests/recorded-stand.test.ts`. Не доказывает поведение рабочей модели Groq.
- Живой провайдер только в рамках бесплатного суточного лимита, не больше 40 тыс. токенов в сутки на проверки; платные API и повышение тарифа исключены.

Полный набор тестов без live: **446 из 446** на кандидате `feat/s4-operations`, `tsc` и `next lint` без ошибок.

## Нестабильные тесты (исправлены 07.10.2026)

- `thought-media-create` (параллельные POST с одним ключом): создание сериализуется по ключу, стресс-тест (12 раундов × 3 запроса) падал на старом коде и проходит.
- `r2-idempotency` (две вкладки, итоговый сценарий): явный токен `expectedFinalScriptId`, гонка стала детерминированной.
- `v03-agent-actions` «two executors of one turnKey…»: сейчас 0 падений из 8 одиночных и во всех полных прогонах этой сессии; отдельного исправления не потребовалось.

## Что делать дальше

1. 09.10: живая проверка повторов после «не знаю» (`r5.ts --only=repeats`, реплики «Не знаю.» добавлены) и оффтопа с новым серверным возвратом; сначала `probe-limit.ts`. Сегодня (08.10) израсходовано 33 914 токенов по `AiCall` + неизвестный расход повторов приложения.
2. Решения владельца: K4 (ноль или два кандидата), расшифровки семи авторов в `Analyz/_private_raw/`, независимый проход «опровергни», выбор SMTP, что делать с лимитом провайдера при нескольких авторах, слияние по `PR_DRAFT.md`.
3. K5 только после слова владельца.

## Ветки (цепочка, каждая от предыдущей; в `main` ничего не слито, PR не создавались)

`fix/c00-live-action-shape` (база `0066469`) → `feat/s1-ai-gateway` (`c11118f`) → `feat/s3-entry-cleanup` (`1fdedec`) → `feat/s2-data-deletion` (`a15ad85`) → `feat/s4-operations` (HEAD ветки, см. `git log`; на 08.10 вечером после правок возврата оффтопа) → `docs/cards-research` (K-docs и K5-lite, в неё влита `feat/s4-operations`).

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

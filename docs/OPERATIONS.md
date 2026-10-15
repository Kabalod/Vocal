# Vocal — эксплуатация (закрытый запуск)

Решение владельца (S0): **один долгоживущий сервер**, медиа на постоянном томе, очередь обработки в процессе, база — Supabase Postgres. Запускать **ровно один экземпляр** приложения. Что из этого проверено, а что нет — в `docs/audit/S4_REPORT.md`.

## 1. Что нужно

- Сервер/VM или контейнерный хост с постоянным диском; Docker (рекомендуется) или Node.js 22 + systemd.
- Проект Supabase (Postgres + Auth). Переменные окружения (значения не хранить в git):

| Переменная | Назначение |
|---|---|
| `DATABASE_URL` | Подключение приложения (pooler или direct проекта Vocal) |
| `DIRECT_URL` | Прямое подключение для миграций и `pg_dump` (не pooler) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Вход; вшиваются в клиент при **сборке** |
| `SUPABASE_SERVICE_ROLE_KEY` | Только сервер: удаление аккаунта (`auth.users`, `public.profiles`, бакет). Без него удаление аккаунта отвечает 503 |
| `GROQ_API_KEY` | Модель и расшифровка |
| `VOCAL_STORAGE_ROOT` | Корень, внутри которого лежит `storage/` (в Docker: `/data`) |
| `VOCAL_DAILY_TOKEN_LIMIT`, `VOCAL_DAILY_STT_SECONDS` | Суточные лимиты на пользователя (по умолчанию 200000 / 3600) |
| `VOCAL_AI_TIMEOUT_MS`, `VOCAL_STT_TIMEOUT_MS` и др. | Таймауты, см. `.env.example` |
| `VOCAL_SHUTDOWN_GRACE_MS` | Сколько ждать завершения активных заданий при остановке (25000) |
| `NEXT_MANUAL_SIG_HANDLE=true` | **Обязательно** в production: иначе Next выходит по SIGTERM раньше, чем задание доработает (в Dockerfile уже задано) |

Никогда не задавать в production: `VOCAL_UI_TEST_DB`, `VOCAL_AI_MOCK`, `VOCAL_STT_MOCK`, `VOCAL_SKIP_JOB_ENQUEUE`, `VOCAL_JOB_LEASE_MS`.

## 2. Сборка и запуск

### Docker (рекомендуется)

```bash
cp .env.example .env          # заполнить значения
docker compose build          # NEXT_PUBLIC_* берутся из окружения/.env
docker compose up -d
curl -fsS http://127.0.0.1:3000/api/health   # {"postgres":true,"storage":true,"ffmpeg":true,...}
```

`docker-compose.yml`: один сервис, том `vocal-media` → `/data`, `stop_grace_period: 60s`. **Не увеличивать число реплик.**

### Без Docker

```bash
npm ci
NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=… npm run build
NODE_ENV=production NEXT_MANUAL_SIG_HANDLE=true VOCAL_STORAGE_ROOT=/var/lib/vocal node_modules/.bin/next start
```

Под systemd: `KillSignal=SIGTERM`, `TimeoutStopSec=60`, `Restart=on-failure`, один unit.

### Миграции

Применяются отдельным шагом **до** запуска новой версии: `npm run db:migrate` (выполняет `prisma migrate deploy` по `DIRECT_URL`). На live: `migrate resolve`, baseline и `db push` не использовать. Новые миграции этапов S1–S5 не создавались.

## 3. Остановка и перезапуск

SIGTERM: новые задания не запускаются, активные получают до `VOCAL_SHUTDOWN_GRACE_MS` на завершение, у недоработавших снимается lease, процесс выходит. При жёстком убийстве (SIGKILL, потеря питания) задание подхватывается автоматически: проверка каждую минуту и при старте, после истечения lease (2 минуты). Потеря задания невозможна, но распознавание могло быть оплачено дважды (одна попытка из трёх на каждый запуск). Проверено тестами `tests/s4-restart.test.ts` на настоящих процессах.

## 4. Обновление и откат

1. `git fetch` → нужный тег/коммит; `docker compose build`.
2. Бэкап (раздел 5).
3. Если есть новые миграции — `npm run db:migrate`.
4. `docker compose up -d` (контейнер получает SIGTERM, активные задания дорабатываются).
5. Проверка: `/api/health`, вход, создание текстовой мысли.

Откат: вернуть предыдущий коммит/образ и `docker compose up -d`. Миграции назад не откатываются: если версия добавила миграцию, откат кода допустим только пока старый код совместим со схемой (описано в отчёте этапа); иначе — восстановление из бэкапа (раздел 5).

## 5. Бэкап и восстановление

Источник правды — Postgres (Supabase) и том с медиа. Вход (`auth.users`) бэкапит сам Supabase: проверить, что на тарифе включены ежедневные бэкапы/PITR, срок хранения записать здесь: ______ .

Наш собственный логический бэкап (переносимый, схема `public` + медиа):

```bash
DIRECT_URL=… VOCAL_STORAGE_ROOT=/var/lib/vocal scripts/ops/backup.sh /srv/vocal-backups
```

Создаёт `<каталог>/<UTC-время>/` с `storage.tar.gz`, `db.dump`, `counts.txt`, `SHA256SUMS`, `manifest.json`. Порядок «сначала медиа, потом БД»: каждая строка из дампа имеет файл в архиве. Расписание: ежедневно (cron) + перед каждым обновлением; копии хранить вне сервера. Нужен `pg_dump` той же или более новой версии, чем сервер БД.

Восстановление — **только в пустую** базу и пустой каталог (скрипт откажется иначе):

```bash
scripts/ops/restore.sh /srv/vocal-backups/20261005T120000Z "postgresql://…/vocal_restore" /var/lib/vocal-restore
scripts/ops/verify-restore.sh "postgresql://…/vocal_restore" /var/lib/vocal-restore /srv/vocal-backups/20261005T120000Z
```

`verify-restore.sh` сравнивает число строк с `counts.txt` и проверяет, что каждый файл, на который ссылается БД, есть на диске; при любой проблеме завершается с ошибкой.

**Проверка восстановления** (раз в месяц и после изменения схемы): выполнить две команды выше на чистой машине (или в чистой БД) и записать дату и результат: ______ .

**Удалённые данные и копии.** Удаление мысли/аккаунта (S2) не затрагивает уже сделанные копии. Копии старше срока хранения удалять; срок хранения — ______ дней (рекомендуется ≤ 30).

## 6. Письма регистрации (SMTP) — действие владельца

Встроенная почта Supabase сильно ограничена по числу писем. Нужно (в панели проекта, не в коде):

1. Выбрать провайдера и домен отправителя (SPF/DKIM) — **решение владельца не принято** (S0.5).
2. Authentication → SMTP Settings: включить Custom SMTP.
3. Authentication → URL Configuration: Site URL = адрес приложения; Redirect URLs: `<адрес>/auth/callback` (регистрация и сброс пароля идут через `/auth/callback?next=…`).
4. Authentication → Email Templates: вставить `docs/ops/email/confirm-signup.html` («Confirm signup», тема «Подтвердите почту в Vocal») и `docs/ops/email/reset-password.html` («Reset password», тема «Сброс пароля в Vocal»).
5. Проверить на живой среде: регистрация → письмо → переход → вход; сброс пароля → письмо → новый пароль. Результат записать в отчёт S5.

## 7. Что смотреть

- `GET /api/health`: `postgres` (503, если база недоступна), `schema` (503 и `postgresStatus: "schema_missing"`, если миграции не накатаны — первый `docker compose up` до `npm run db:migrate`), `storage` (том доступен на запись), `ffmpeg`, `groq` (есть ли ключ). Для проверки мягкой остановки без живой модели: `VOCAL_STT_MOCK=1 VOCAL_STT_MOCK_DELAY_MS=15000` (только mock, не более 120 с) держит задание в STT.
- `npm run report:ai` — расход модели по дням (токены чата и секунды STT: `kind = stt`).
- Диск: каталог `storage/`. Файлы без ссылок из БД старше часа удаляются сами (старт и каждые 6 часов).

## 8. Квота мыслей и защита от злоупотреблений (J1)

Квота «100 мыслей за оплаченный период» хранится в таблице `UserQuota` (миграция `prisma/pending/11_user_quota`, **подготовлена, на живую базу не применялась**; применять только по решению владельца). Период `[periodStart, periodEnd)` привязан к дате оплаты. Мысль тратится при создании (текст, голос/видео, карточка через `/api/reels`); диалог, сценарий, правки и повторы внутри мысли не тратят, повтор того же ключа создания не тратит второй раз. Нет строки, период истёк или `thoughtsUsed >= thoughtsLimit`: создание мысли отвечает 402 `QUOTA_EXHAUSTED` (с `periodEnd`); существующие мысли остаются доступны.

Защиты без квоты (L1, вариант Б): `VOCAL_ABUSE_GUARDS=on` включает лимит запросов в минуту, глобальный выключатель и потолок на мысль **без** квоты и без таблицы `UserQuota`; суточный лимит токенов и STT на пользователя остаётся; владельцы из `VOCAL_OWNER_USER_IDS` освобождены. `VOCAL_QUOTA=on` включает и квоту, и эти защиты.

Переменные окружения: `VOCAL_QUOTA` (включается только явным `on`; по умолчанию выключена, в том числе в production; перед `on` нужна миграция `11_user_quota`), `VOCAL_OWNER_USER_IDS` (id владельцев/разработчиков через запятую: без квоты, суточный лимит токенов `VOCAL_DAILY_TOKEN_LIMIT` для них остаётся; у остальных он отключён), `VOCAL_RATE_PER_MINUTE` (запросов в минуту на пользователя, по умолчанию 30, ответ 429 `RATE_LIMITED`), `VOCAL_GLOBAL_DAILY_TOKEN_CAP` (суммарный расход всех пользователей за сутки, по умолчанию 20 млн токенов, при превышении 503 `AI_PAUSED`, `0` отключает), `VOCAL_THOUGHT_QUESTION_CEILING` (8) и `VOCAL_THOUGHT_TOKEN_CEILING` (40 000): потолок диалога на одну мысль, дальше модель не вызывается и автору предлагается собрать сценарий. Оплата — заглушка: `renewPeriod(userId)` (`src/lib/quota.ts`) и dev-эндпоинт `POST /api/dev/quota/renew` (в production отвечает 404). Состояние квоты: `GET /api/account/quota`.


## 9. Ежедневный отчёт расхода модели (L1)

`npm run report:daily -- [--day YYYY-MM-DD] [--out-dir DIR]` пишет `ai-usage-YYYY-MM-DD.md` и `.json` (каталог по умолчанию `$VOCAL_REPORT_DIR` или `./reports`). Из `AiCall` читает только вид действия, статус, пользователя, токены и время; тексты не читает, модель не вызывает. В отчёте: итог дня и последних 24 часов против суточного лимита провайдера (`VOCAL_PROVIDER_DAILY_TOKEN_LIMIT`, по умолчанию 200 000; ничего не ограничивает), расход по пользователям, по виду действия, расшифровка голоса (секунды) отдельно. В отчёте также пик токенов и вызовов за 60 с против лимитов провайдера (`VOCAL_PROVIDER_TPM_LIMIT`, `VOCAL_PROVIDER_RPM_LIMIT`) и число отказов 429. При 429 провайдера приложение повторяет вызов до 3 раз (бюджет ожидания `VOCAL_AI_RETRY_WAIT_MS`, 60 с), затем отвечает 503 `AI_BUSY` с сохранением ответа автора. Запуск раз в день — на стороне сервера (cron/таймер); в репозитории расписание не настроено. Подробности: `docs/audit/L1_ROLLOUT_PLAN.md`, разделы 4а и 5.

## Живые вызовы провайдера в тестах (правило)

Тесты, которые ходят к Groq/xAI/Whisper (платные), по умолчанию **пропускаются**. Включение — только намеренно: `VOCAL_LIVE_TESTS=1` (и `GROQ_API_KEY`). Без флага:
- `tests/c00-classify-live.test.ts`, `tests/c00-live-model.test.ts` делают skip с понятной причиной и не читают ключ из `.env`;
- при `NODE_ENV=test` клиент провайдера (`getGroq`, `createXaiChatCompletion`) бросает ошибку при попытке реального вызова; фейковый клиент через `groqClientSeam` и моки работают как раньше;
- `tests/live-guard.test.ts` проверяет это без сети.

Никогда не запускать `tsx --test` без явного списка файлов: он подбирает все `tests/*.test.ts`. Живой набор — только по отдельному решению владельца.

## Тяжёлые команды на малой машине (3,9 ГБ ОЗУ, без swap)

`/tmp` — tmpfs и считается в ОЗУ. `next build`, `next dev`, `tsc`, набор тестов и Chromium вместе съедают память, и хост зависает целиком. Любую тяжёлую команду запускать только через обёртку:

```
source ~/vocal-dev/env.sh   # node в PATH
scripts/ops/limited.sh build node_modules/.bin/next build
scripts/ops/limited.sh test  node_modules/.bin/tsx --test --test-concurrency=1 tests/x.test.ts
scripts/ops/limited.sh tsc   node_modules/.bin/tsc --noEmit
scripts/ops/limited.sh dev   node_modules/.bin/next dev -p 3202
scripts/ops/limited.sh shoot bash serve-shoot.sh out/   # next + Chromium вместе
```

Профили: build 2000M, test 1400M, tsc 1400M, dev 1500M, shoot 1800M (cgroup `MemoryMax`, без swap) + `--max-old-space-size`. Превысивший задание убивается ядром (exit 137), хост жив. Замок `/tmp/vocal-heavy.lock` пускает по одному заданию; `VOCAL_LIMIT_NOWAIT=1` — отказ вместо ожидания. Если свободно меньше 60 % потолка — отказ с кодом 75.

Правила: не держать `next dev` и `next start` одновременно; после съёмки убивать сервер; не складывать worktree и `.next` в `/tmp` без нужды (проверка: `df -h /tmp`).

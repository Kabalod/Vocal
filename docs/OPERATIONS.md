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

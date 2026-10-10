# Локальный запуск для живого голосового диалога

Проверено 10.10.2026 на этой машине (Linux): сервер поднимается, `/api/health` и `/reels` отвечают, список мыслей пуст. **Обращения к модели и запись голоса в проверке не выполнялись.**

Что получится: приложение на `http://localhost:3111`, **локальная** Postgres (не Supabase), вход без регистрации (один пользователь `owner-local`). Модель и расшифровка голоса работают через ваш `GROQ_API_KEY` из `.env` и тратят токены.

## Запуск

```bash
cd ~/Vocal
source ~/vocal-dev/env.sh            # PATH, TEST_DATABASE_URL
bash ~/vocal-dev/start-pg.sh         # локальная Postgres на 54329 (повторный запуск безопасен)
export URL=$(npx tsx ~/vocal-dev/mkschema.ts | tail -1)   # новая схема с миграциями, печатает адрес
unset NODE_ENV
NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY= SUPABASE_SERVICE_ROLE_KEY= \
VOCAL_UI_TEST_DB=1 VOCAL_REQUIRE_SUPABASE_AUTH=0 \
TEST_DATABASE_URL="$URL" DATABASE_URL="$URL" DIRECT_URL="$URL" \
VOCAL_TEST_USER_ID=owner-local VOCAL_STORAGE_ROOT=$HOME/vocal-local-media \
node_modules/.bin/next dev -p 3111
```

Зачем пустые `NEXT_PUBLIC_SUPABASE_*`: они лежат в `.env`, и тогда приложение требует вход через Supabase (ответ 401). Переменные процесса сильнее `.env`, поэтому пустые значения отключают вход, а `DATABASE_URL`/`DIRECT_URL` на локальную схему не дают дотянуться до live-базы. **Не задавайте `VOCAL_AI_MOCK` и `VOCAL_STT_MOCK`**: с ними вместо модели и Whisper работают заглушки.

Дальше: открыть `http://localhost:3111/reels`, записать мысль голосом (браузеру нужен доступ к микрофону; на `localhost` он разрешён), вести диалог, нажать «Сгенерировать сценарий». Остановить: Ctrl+C. Схема остаётся в локальной Postgres.

Квота мыслей (J1) в этом режиме выключена, суточный лимит токенов 200 000 действует (`VOCAL_DAILY_TOKEN_LIMIT=0` отключает).

## Где взять результат

Нужен id мысли: он в адресе страницы `/reels/<id>` или в `GET http://localhost:3111/api/reels`.

**Одним файлом (рекомендуется)**: `TEST_DATABASE_URL=<адрес схемы> npx tsx scripts/export-run.ts --thought=<id> --out=run.md` (адрес схемы печатает `local-schema.ts`, на Linux это `$URL` из шага запуска). Скрипт только читает локальную базу (Supabase и `DATABASE_URL` он не принимает) и пишет markdown: реплики диалога (у голосовых и сырой текст Whisper, и нормализованный), принятые факты, версии сценария с «что изменено», токены по вызовам модели. Пример на тестовых данных: `docs/audit/export-run-example.md`.

Отдельно через API: `GET /api/thoughts/<id>/dialogue` (диалог, JSON), `GET /api/reels/<id>/export?format=txt` (сценарий).

## Windows (PowerShell + Docker Desktop)

Нужны Docker Desktop и Node.js 22. Один раз:

1. В корне репозитория создайте файл `.env.local` со строкой `GROQ_API_KEY=ваш_ключ` (файл в `.gitignore`, в репозиторий не попадает; скрипт его только проверяет, ключ не печатает).
2. Запуск: `powershell -ExecutionPolicy Bypass -File scripts\local\start-local.ps1`. Скрипт поднимает Postgres из `docker-compose.local.yml` (только `127.0.0.1:54329`, данные в томе `vocal-local-pgdata`), делает `npm install` при первом запуске, создаёт схему `vocal_local` с миграциями и запускает приложение на `http://localhost:3111`. `-Reset` пересоздаёт схему (локальные мысли пропадут).
3. Экспорт: тот же `npx tsx scripts/export-run.ts --thought=<id> --out=run.md`, но с `$env:TEST_DATABASE_URL='postgresql://postgres:vocal_local@127.0.0.1:54329/vocal_local?schema=vocal_local'`.

Пустые `NEXT_PUBLIC_SUPABASE_*` из Linux-варианта на Windows заменены значением из одного пробела: Windows удаляет переменную, заданную пустой строкой, и тогда Next подставил бы значения из `.env`. Приложение считает пробел «не задано».

**Не проверено**: сам `start-local.ps1` на Windows я не запускал (на этой машине нет PowerShell). Проверены на Linux: `local-schema.ts`, `export-run.ts` и запуск приложения с теми же переменными (пробелы вместо пустых значений): `/reels` отвечает 200 без входа. Если скрипт на Windows споткнётся, пришлите текст ошибки.

## Ограничения

- Linux-вариант выше работает на машине с локальной Postgres (`start-pg.sh`); для Windows — раздел выше.
- Это локальный режим тестового контура: не использовать в production.

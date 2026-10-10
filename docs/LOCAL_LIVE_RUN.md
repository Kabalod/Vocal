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

- **Диалог**: `GET http://localhost:3111/api/thoughts/<id>/dialogue` — JSON, страницы по курсору (`?cursor=` из `nextCursor`). Ответы автора лежат как есть (расшифровка Whisper).
- **Сценарий**: `GET http://localhost:3111/api/reels/<id>/export?format=txt` (текст) или без `format` — JSON; конкретная версия: `&scriptId=<id>`.
- В JSON-экспорте мысли диалога **нет** (проверено по коду `export-reel.ts`), поэтому диалог берётся отдельным запросом выше.

Одного файла «диалог + сценарий» сейчас нет. Если нужен, это небольшой скрипт; не писал, пока вы не попросили.

## Ограничения

- Работает только на машине с локальной Postgres (`start-pg.sh`). На Windows из README (PowerShell) этих скриптов нет; если запускать там, нужна своя локальная Postgres, и тогда скажите, я подготовлю шаги.
- Это локальный режим тестового контура: не использовать в production.

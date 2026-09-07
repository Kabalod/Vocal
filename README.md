# Vocal

Личный помощник автора разговорных роликов: идея → дубли → расшифровка → вопросы → сценарий.

Целевые требования: [docs/PERSONAL_MVP.md](docs/PERSONAL_MVP.md).  
Статус этапов: [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md).  
План работы в Cursor: [docs/cursor-plan/README.md](docs/cursor-plan/README.md).

В репозитории есть разовый анализатор загруженного видео (FFmpeg → Groq Whisper → оценки). Описание реализации — [SPEC.md](./SPEC.md). Это прежняя спецификация, не цель личного MVP. Живой прогон пайплайна на этапе 0 не выполнялся.

## Что нужно (Windows)

- Node.js 22+ (проверено: 22.17.1)
- npm
- Ключ [Groq](https://console.groq.com/) в `.env` (`GROQ_API_KEY`) — только для распознавания и ИИ-разбора
- FFmpeg подтягивается через `ffmpeg-static` / `ffprobe-static` (системный ставить не обязательно)

## Первая установка

В PowerShell из корня репозитория. Файл `.env` создаётся **только если его ещё нет** — существующий ключ не перезаписывается.

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
# при необходимости впишите GROQ_API_KEY в .env
npm install
npx prisma db push
npx prisma db seed
npm run dev
```

Откройте http://localhost:3000. Без ключа Groq интерфейс может подняться; распознавание и анализ без ключа не выполнятся.

## Обычный запуск

Если зависимости уже установлены и схема БД накатана:

```powershell
npm run dev
```

Проверки кода (без вызова модели):

```powershell
npm run typecheck
npm run lint
npm run build
```

## Резервное копирование

Перед любой миграцией схемы остановите `npm run dev` (и любой другой процесс, пишущий в БД).

1. Скопируйте файл SQLite (обычно `prisma/dev.db`) в каталог вне репозитория, например `%USERPROFILE%\Vocal-backups\<дата>\`.
2. Скопируйте пользовательские медиа: `storage/videos` и `storage/audio`.
3. Проверьте восстановление на **копии**: отдельный каталог + временный `DATABASE_URL`, не на боевом файле.
4. Не используйте `migrate reset`, `db push --force-reset` и флаги с потерей данных.

`.env`, база, анкета и медиа в git не входят.

## Пайплайн текущего кода

Реализация в коде (не результат ручной проверки на этом этапе):

1. Загрузка видео (mp4 / webm / mov / mkv, ≤ 3 мин, ≤ 80 МБ)
2. FFmpeg: MP3 16 kHz mono 64 kbps
3. Groq STT: `whisper-large-v3-turbo`, `language=ru`
4. Метрики и Groq LLM по критериям; итоговые веса считает backend

Исследования блогеров в `Analyz/` не нужны для запуска приложения.

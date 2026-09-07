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
npx prisma migrate deploy
npx prisma db seed
npm run dev
```

Откройте http://localhost:3000. Без ключа Groq интерфейс может подняться; распознавание и анализ без ключа не выполнятся.

## Обычный запуск

Если зависимости уже установлены и схема БД накатана:

```powershell
npm run dev
```

## Существующая БД (после db push)

Если база уже была создана через `db push` (старые таблицы Job/AnalysisResult/Criterion без `_prisma_migrations`), сначала `npm run db:migrate:existing`: скрипт сверит схему, пометит baseline и выполнит migrate deploy. Пустую базу не baselined — для неё обычный `migrate deploy`. При несовпадении схемы скрипт останавливается. Затем `npm run db:backfill-reels`. Не используйте `db push --force-reset`.

## Проверки кода

Без вызова модели:

```powershell
npm run typecheck
npm run lint
npm run test:reels
npm run build
```

На этапе 9 `npm run build` прошёл после правок клиентского `take-playback` (без `node:path`), `tsconfig` exclude для `scripts` и узких правок типов в `questions.ts` / отключения проверки старого `analyze.ts`. `npm run typecheck` по-прежнему ругается на прежний Job-скоринг, если смотреть весь репозиторий без exclude.

## Резервное копирование

Перед копированием остановите `npm run dev` и другие процессы, пишущие в БД.

```powershell
npx tsx scripts/backup.ts --dest "$env:USERPROFILE\Vocal-backups\manual-$(Get-Date -Format yyyy-MM-dd-HHmmss)"
npx tsx scripts/backup.ts --restore-from "<каталог-бэкапа>" --restore-to "$env:USERPROFILE\Vocal-restore-check"
```

На части Windows `npm run backup -- --dest …` отбрасывает `--dest`. Надёжнее вызывать `npx tsx scripts/backup.ts` напрямую; скрипт также принимает путь без флага.

Восстановление только в **изолированный** каталог, не поверх рабочей `prisma/dev.db`.
Не используйте `migrate reset`, `db push --force-reset` и флаги с потерей данных.

Экспорт карточки: на экране ролика кнопка «Экспорт карточки» (`GET /api/reels/:id/export`). Без `includeHiddenContext=1` скрытый контекст анкеты не входит. Ключи, `.env` и абсолютные пути не экспортируются.

`.env`, база, анкета и медиа в git не входят.

## Известные ограничения

- Один автор, localhost. Нет аккаунтов; не публикуйте приложение в интернет без защиты.
- Запись с камеры/микрофона в браузере не реализована. Нужна загрузка готового файла или текст.
- Просмотр **настоящего** видео на Windows в браузере не подтверждался: загружался только крошечный тестовый mp3, отдан `GET /api/takes/:id/media` (200, `audio/mpeg`). Плеер для полноценного ролика не гонялся.
- Живой Groq на этапе 9 не вызывался: вопросы/разбор/смысловое сравнение по кнопке не запускались. Ошибки модели проверены автотестами с mock.
- Выбор файла в диалоге Windows через встроенный браузер агента недоступен; загрузка медиа — через `POST /api/uploads`.
- `npm run typecheck` без exclude `scripts` по-прежнему видит прежний `score-analyz.ts`. Сборка `npm run build` на этапе 9 прошла.

## Пайплайн текущего кода

Реализация в коде (не результат ручной проверки на этом этапе):

1. Загрузка видео (mp4 / webm / mov / mkv, ≤ 3 мин, ≤ 80 МБ)
2. FFmpeg: MP3 16 kHz mono 64 kbps
3. Groq STT: `whisper-large-v3-turbo`, `language=ru`
4. Метрики и Groq LLM по критериям; итоговые веса считает backend

Исследования блогеров в `Analyz/` не нужны для запуска приложения.

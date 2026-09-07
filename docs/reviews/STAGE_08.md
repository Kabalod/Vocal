# Отчёт после этапа для проверки через GitHub

## Идентификация

- Этап: 8 — сравнение, экспорт и итоговая проверка
- Репозиторий: Kabalod/Vocal
- Ветка: feat/personal-mvp-08-comparison-and-release-check
- BASE_SHA (до изменений): 87cf50b8dc8d01f98a2e64120d51ab308b9921db
- HEAD_SHA (после изменений): (заполнится docs-коммитом)
- Ссылка на ветку: https://github.com/Kabalod/Vocal/tree/feat/personal-mvp-08-comparison-and-release-check
- Ветка отправлена в GitHub: будет после push без force
- Предыдущий этап принят: да, этап 7 на `87cf50b8dc8d01f98a2e64120d51ab308b9921db`

## Реализовано

Текстовые различия двух выбранных версий считает детерминированный код; число правок не считается качеством. Смысловое сравнение пишется отдельной записью только по явной кнопке и с целью правки; модель не выбирает финальный дубль. Экспорт JSON карточки: идея, тексты, вопросы/ответы, сценарии, метаданные дублей и разборов; полная анкета и скрытый контекст только с `includeHiddenContext=1`. Ключи и абсолютные пути не входят. `scripts/backup.ts` копирует БД и медиа; восстановление — в другой каталог. Автотест проходит полный цикл на вымышленных данных с mock Groq. В `docs/reviews/STAGE_07.md` HEAD исправлен на `87cf50b`.

## Файлы

| Путь | Изменение и причина |
|---|---|
| prisma/schema.prisma | CompareResult |
| prisma/migrations/20260907132000_compare_results | ADD без reset |
| src/lib/text-diff.ts | детерминированный diff |
| src/lib/compare.ts | стороны, preview, список |
| src/lib/ai/compare.ts | смысловое сравнение по кнопке |
| src/app/api/reels/[id]/compare/route.ts | GET preview/история, POST |
| src/lib/export-reel.ts | экспорт без ключей и путей |
| src/app/api/reels/[id]/export/route.ts | GET экспорта |
| src/lib/backup.ts, scripts/backup.ts | backup/restore в изолированный каталог |
| src/components/TakeComparison.tsx | UI сравнения, финала, экспорта |
| src/app/reels/[id]/page.tsx | блок сравнения |
| tests/text-diff.test.ts, tests/personal-mvp.test.ts | diff и полный цикл |
| README.md, docs/* | запуск, backup, ограничения, HEAD этапа 7 |

## Данные и миграции

- Требуемые команды: `npx prisma migrate deploy`
- Как сохранены старые данные: новая таблица; payload AnalysisResult не менялся
- Где находится локальная резервная копия (без её содержимого): `%USERPROFILE%\Vocal-backups\stage08-2026-09-07-225632`
- Проверялось ли восстановление: SHA256 копии backup совпал с файлом до миграции; restore скриптом в изолированный TEMP (не поверх live)
- Проверялся ли повтор миграционного переноса: хеши payload AnalysisResult live vs backup совпали (2 записи)

## Проверки

| Команда или ручной сценарий | Выполнено? | Результат | Ограничения |
|---|---|---|---|
| `npm run test:reels` | да | 28/28 | временные SQLite, mock Groq |
| `npm run lint` | да | exit 0 | — |
| `npm run typecheck` | да | исходные analyze.ts, score-analyz.ts, questions.ts | новых ошибок этапа нет |
| `npm run build` | нет | — | не запускался |
| Браузер / живой Groq / плеер Windows | нет | — | не называю пройденным |
| Камера/микрофон | нет | — | не входят в план |

- Исходные ошибки проекта: `src/lib/analyze.ts`, `scripts/score-analyz.ts`, `src/lib/ai/questions.ts`
- Новые ошибки этапа: нет
- Платные вызовы использовались: нет
- Какие проверки требуют компьютера пользователя: экспорт в UI, backup при остановленном dev, просмотр видео на Windows

## ИИ

- Какие действия реально вызывают модель: POST compare с `runAi: true`; прежние review/questions/script generate
- Какие действия проверены без ключа: diff, экспорт, backup, сохранение сравнения, полный цикл (mock)
- Какие версии входов сохраняются: take/transcript ids, intent, textDiffJson, snapshot, promptVersion `compare-v1`
- Что происходит при ошибке: CompareResult.status=error, дубли и тексты на месте

## Осталось

- Невыполненные условия готовности: живой UI/Groq/Windows player не гонялись
- Известные проблемы: нет аккаунтов; приложение не для публикации в интернет
- Отклонения от плана и причины: автотест в `tests/personal-mvp.test.ts` (tsx/node:test), не Playwright `*.spec.ts`; этап не объявлен принятым

## Запрос ревьюеру

Проверь изменения BASE_SHA..HEAD_SHA и соответствие инструкции этапа.
Укажи блокирующие ошибки отдельно от необязательных улучшений.
Не считай этап принятым только на основании этого отчёта.

## После замечаний

- Замечание:
- Исправление:
- Новый commit SHA:
- Повторная проверка:

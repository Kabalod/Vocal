# Vocal design — единственный вход для моделей и разработки

Обновлено: 2026-09-16.

Если ты агент или Cursor: **начинай отсюда**. Не читай champagne Design System, не открывай `docs/cursor-plan/STAGE_*`, не опирайся на старые PNG вне списка ниже.

## Порядок чтения

1. Этот файл.
2. `SOURCE_OF_TRUTH_2026-09-15.md`
3. `план разработки/README.md` — этапы внедрения и промпты.
4. По задаче: `THOUGHT_JOURNEY_REVISION_2026-09-15.md`, `DEVELOPMENT_READINESS_2026-09-15.md`, `SHARED_DESIGN_BRIEF_2026-09-15.md`.

## Актуальные материалы (можно использовать)

| Путь | Роль |
|---|---|
| `план разработки/` | Очередь внедрения в код + Cursor-промпты |
| `docs/design/SOURCE_OF_TRUTH_2026-09-15.md` | Приоритеты источников |
| `docs/design/SHARED_DESIGN_BRIEF_2026-09-15.md` | Токены, навигация, общие правила UI |
| `docs/design/THOUGHT_JOURNEY_REVISION_2026-09-15.md` | Рабочий цикл мысли |
| `docs/design/DEVELOPMENT_READINESS_2026-09-15.md` | Что готово к коду / R1–R8 |
| `docs/design/SCREEN_STYLE_AUDIT_2026-09-15.md` | Что заменить в живом приложении |
| `docs/design/SYNC_CHECK_2026-09-15.md` | Синхронизация потоков / must-fix |
| `docs/design/WORKING_CYCLE_CHECKPOINT_2026-09-15.md` | Статус сквозной сборки |
| `docs/design/working-cycle-output/` | Актуальный прототип (`review.html`) |
| `docs/design/profile-model-output/` | Принятый смысл профиля P10–P12 |
| `docs/design/references-new/` | **Визуальный источник истины** — утверждённые экраны 01–08 |
| `docs/PERSONAL_MVP.md` | Продуктовые правила MVP (UI-описания champagne внутри устарели) |

## Запрещено как инструкция (архив)

Всё в `docs/_archive/design-pre-violet-2026-09-16/`, в том числе:

- champagne `DESIGN_SYSTEM.md`
- старый `cursor-plan` STAGE_00–09
- промежуточный `core-model-output`
- `control-frames` sync-эксперимент
- profile handoff ZIP и task-копии

Файл `docs/design/DESIGN_SYSTEM.md` сейчас — заглушка-редирект, не система дизайна.
Папка `docs/cursor-plan/` содержит только заглушку-редирект.

## Проверка этапов

После каждого этапа из `план разработки` результат проверяет агент «Создание приложение». Без вердикта «принято» следующий этап не начинать.

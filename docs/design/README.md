# Vocal design — единственный вход для моделей и разработки

Обновлено: 2026-09-28. Очередь продукта: [`docs/ROADMAP.md`](../ROADMAP.md) (карта **не принята**). Продукт C00 принят на `e268c40`. Auth принят на `51d6033`. Live-схема: стратегия пересоздания принята, не применена. V04 не принят. `план разработки/` — исторический визуальный цикл, не канбан V/C00.

Если ты агент или Cursor: **дизайн начинай отсюда**; **очередь продукта** — в `docs/ROADMAP.md`. Не читай champagne Design System, не открывай `docs/cursor-plan/STAGE_*`, не опирайся на старые PNG вне списка ниже.

## Порядок чтения

1. [`docs/ROADMAP.md`](../ROADMAP.md) — общий маршрут V / C00 / Auth / I / запуск.
2. Этот файл.
3. `SOURCE_OF_TRUTH_2026-09-15.md`
4. `план разработки/README.md` — исторический визуальный цикл P00–P17, не текущий трекер статусов.
5. По задаче: `THOUGHT_JOURNEY_REVISION_2026-09-15.md`, `DEVELOPMENT_READINESS_2026-09-15.md`, `SHARED_DESIGN_BRIEF_2026-09-15.md`.

## Актуальные материалы (можно использовать)

| Путь | Роль |
|---|---|
| [`docs/ROADMAP.md`](../ROADMAP.md) | Общий продуктовый маршрут на 27.09.2026 |
| `план разработки/` | Исторический визуальный цикл P00–P17, не канбан V/C00 |
| `docs/design/SOURCE_OF_TRUTH_2026-09-15.md` | Приоритеты источников |
| `docs/design/SHARED_DESIGN_BRIEF_2026-09-15.md` | Токены, навигация, общие правила UI |
| `docs/design/THOUGHT_JOURNEY_REVISION_2026-09-15.md` | Рабочий цикл мысли |
| `docs/design/DEVELOPMENT_READINESS_2026-09-15.md` | Что готово к коду / R1–R8 |
| `docs/design/SCREEN_STYLE_AUDIT_2026-09-15.md` | Что заменить в живом приложении |
| `docs/design/SYNC_CHECK_2026-09-15.md` | Синхронизация потоков / must-fix |
| `docs/design/WORKING_CYCLE_CHECKPOINT_2026-09-15.md` | Статус сквозной сборки |
| `docs/design/working-cycle-output/` | Актуальный прототип (`review.html`) |
| `docs/design/profile-model-output/` | Принятый смысл профиля P10–P12 |
| `docs/design/references-new/` | **Визуальный источник истины** — утверждённые экраны 01–09; для `/reels` использовать экран 09 |
| `docs/design/references-new/09_thoughts_archive/` | Канон архива мыслей: календарь, lazy grid и переходы карточки |
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

Текущие продуктовые этапы проверяют по [`docs/ROADMAP.md`](../ROADMAP.md). Исторические этапы P00–P17 из `план разработки/` после выполнения тоже смотрит агент «Создание приложение»; без «принято» следующий **P-этап** не начинать. Это не очередь C00/V.

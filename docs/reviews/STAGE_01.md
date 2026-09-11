# Отчёт этапа

## Идентификация

- Этап: Stage 01 — визуальная основа и shell
- BASE_SHA: `da1396f138e1be2b549a623a859ee8084cded420`
- Коммит(ы) кода: `968d3cf6a7e7fa3aa40d5ce7deebd07662066e83`
- Коммит исправления: `a1a28530908265f44809a6bdcec9f3f808565912`
- HEAD_SHA: `a1a28530908265f44809a6bdcec9f3f808565912`
- Ветка: `feat/vocal-v2-01-foundation-shell`
- Ссылка GitHub: https://github.com/Kabalod/Vocal/tree/feat/vocal-v2-01-foundation-shell

DESIGN_05 принят на SHA `da1396f138e1be2b549a623a859ee8084cded420`. Это BASE Stage 01. Поздний docs-only коммит со статусом «принят» на ветке DESIGN_05 базой не становится. DESIGN_06 не начинался.

## Что реализовано

- Токены UI_SPEC в `globals.css`: фон `#070707`, поверхность, field, champagne `#d4a574`, текст на accent, muted, line, input-border, danger, success, focus, радиусы 10/16/20, CTA-shadow, breakpoint `shell` = 1200px (`75rem`).
- Дублирующий hex `#1a140c` заменён на `text-on-accent`.
- `VocalAppShell`: два макета; desktop sidebar 200/64; «Записи» сверху, «Профиль» и сворачивание снизу; persist `localStorage` (`vocal-shell-collapsed`); mobile Sheet без dock; `shell:!hidden` у кнопки «Меню», чтобы `.vocal-btn` не перебивал `hidden`.
- Модальный Sheet: фокус на первое поле внутри панели, Tab/Shift+Tab циклом по «Закрыть» / «Записи» / «Профиль», backdrop не в tab-порядке (`aria-hidden`, не кнопка), Escape/закрытие возвращает фокус на «Меню», overflow и keydown снимаются при размонтировании.
- Маршруты `/reels`, `/profile`, `/`, `/history`, `/settings`, `/jobs/[id]` сохранены; продуктовые экраны не перестраивались.

## Что намеренно не реализовано

- Переименование «Записи» → «Мысли», студия, сценарии, профиль, UI-kit `/dev/ui`, Stage 02+.
- API, Prisma, AI, бизнес-статусы.
- Нижний dock и отдельный tablet-layout.
- Новый веб-шрифт.

## Изменённые файлы

- `src/app/globals.css`, `src/components/VocalAppShell.tsx`, `src/components/shell-layout.ts`, `src/components/shell-status.tsx`
- `text-on-accent` в существующих кнопках/чипах (без смены разметки экранов)
- `tests/shell-layout.test.ts`, `package.json`
- `docs/design/DESIGN_SYSTEM.md`, этот отчёт

## Миграции и данные

- Новая миграция: нет
- Проверка существующей SQLite: не требовалась
- Проверка чистой SQLite: не требовалась
- Backfill: нет
- Возможность отката: git revert коммита кода

## Проверки

| Проверка | Результат | Ограничения |
|---|---|---|
| `npm run test:reels` | 41/41 | mock Groq; +тесты shell layout и Tab-trap Sheet |
| `npm run lint` | exit 0 | — |
| `npm run typecheck` | exit 0 | `scripts` в exclude; `analyze.ts` с `@ts-nocheck` |
| `npm run build` | успех | Next 15.5.23 |
| Browser 390×844 | sidebar скрыт; Sheet; `scrollWidth=390`; Tab цикл Закрыть→Записи→Профиль→Закрыть; Shift+Tab обратно; Escape возвращает фокус на «Меню» | Enter по «Меню» через CDP Input недоступен; открытие кнопкой + Tab/Escape проверены |
| Browser 1280×800 | sidebar 200 / 64; persist; меню скрыто; main ~1065 при 200px sidebar | живой Groq не вызывался |

## AI и внешние сервисы

- Какие AI-вызовы добавлены или изменены: нет
- Проверено mock: да (существующие тесты)
- Проверено live: нет
- Что не проверено: живой Groq, реальная запись медиа

## Совместимость с будущим обучением

Этап не трогал данные, завершение, диалог, профиль-модель и AI.

- Какие исторические данные затронуты: нет
- Может ли что-либо перезаписаться/удалиться при завершении, retry или возврате в работу: нет
- Сохраняются ли source metadata, порядок, итоговые ссылки и snapshots: да, без изменений
- Не создана ли новая рубрика в обход `playbook.ts`/`framework.ts`: нет
- Можно ли позднее добавить read-only learning job без изменения смысла текущих моделей: да

## После замечаний

- Замечание: `role="dialog"` без переноса фокуса, без Tab-trap, backdrop в tab-порядке, фокус не возвращался на «Меню».
- Исправление: `menuButtonRef` / `sheetPanelRef`, `trapSheetTab`, backdrop `aria-hidden` без кнопки, restore focus и `body.style.overflow` в cleanup.
- Новый commit SHA: `a1a28530908265f44809a6bdcec9f3f808565912`
- Повторная проверка: `test:reels` 41/41; lint; typecheck; браузер 390px — Tab, Shift+Tab, Escape. Stage 02 не начинался. Этап не объявлен принятым.

## Подтверждения

- Force push не использовался.
- Следующий этап не начинался.
- Этап не объявляется принятым до внешнего ревью.

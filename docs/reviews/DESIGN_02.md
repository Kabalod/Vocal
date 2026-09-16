# Отчёт этапа

## Идентификация

- Этап: DESIGN_02 — shell и навигация
- BASE_SHA: `c1976b6853b56720aabbc7b0e1e453d4bf7b1f36`
- Коммит кода: `3fa3cc654faeab19caf33af9ea4f144ccea31122`
- HEAD_SHA: `a98cc8e10a9584e80a09c38c96788e1b1998744d`
- Ветка: feat/personal-mvp-design-02-shell
- Состав ветки поверх BASE: два коммита. `3fa3cc6` — код (shell). `a98cc8e` (`docs: record DESIGN_02 HEAD_SHA`) — **только документационный**, без изменений `src/`.

## Изменения

- Что добавлено: каркас `VocalAppShell` — desktop sidebar (Vocal, «Записи», «Профиль», collapse до иконок), header с back, mobile Sheet на ~390px, `overflow-x` обрезан. Маршруты `/`, `/history`, `/settings`, `/jobs/[id]` открываются по URL, в глобальном меню их нет. Состояния shell: `loading.tsx`, `error.tsx`, `not-found.tsx` и `ShellLoading` / `ShellError` / `ShellEmpty`. Тест `tests/shell-nav.test.ts`.
- Что не добавлено: пункты «Идеи», «Дубли», «Сценарий», «Вопросы» в глобальном меню; shadcn и новые пакеты; новые маршруты; переименование H1 «Мои ролики»; правки Prisma, API, ИИ и `src/lib/*`.
- Какие AI-действия появились: нет.

## Проверки

| Проверка | Результат | Ограничения |
|---|---|---|
| `npm run test:reels` | 30/30 | mock Groq; +1 тест навигации shell |
| `npm run lint` | exit 0 | — |
| `npm run typecheck` | exit 0 | `scripts` в exclude; `analyze.ts` с `@ts-nocheck` |
| `npm run build` | успех | Next 15.5.23; сборка сбросила `.next` у живого `next dev`, сервер перезапущен |
| UI smoke | `/`, `/reels`, `/profile`, `/history`, `/reels/[id]`; Sheet на 390px; collapse sidebar на 1280px; горизонтального скролла нет (`scrollWidth === clientWidth`) | клики Next `<Link>` в инструменте браузера иногда не меняли URL; те же маршруты открывались прямой навигацией |

## Непроверено

Настоящий видеоплеер, живой Groq, WCAG-аудит, отдельный прогон каждого empty/error экрана страниц (не shell), DESIGN_03.

## После замечаний

- Замечание:
- Исправление:
- Новый commit SHA:
- Повторная проверка:

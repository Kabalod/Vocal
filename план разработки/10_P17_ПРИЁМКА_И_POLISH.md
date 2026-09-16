# 10. P17: end-to-end приёмка и визуальная полировка

## 1. Назначение и границы

Проверить полный пользовательский путь на реальных данных и только после функциональной стабильности довести visual match с `references-new/`, не меняя product contract.

## 2. Предварительные условия и зависимости

- Этапы 00–09 приняты; exceptions согласованы письменно.
- Доступно воспроизводимое test environment без production secrets.
- Есть baseline screenshots/viewport matrix и critical journeys.

## 3. Точные результаты

- E2E/ручной протокол: create без profile; text/voice dialogue; proposal/script; record с/без script; processing/retry; automatic compare; independent finals; profile draft/confirm; redirects; P16 export.
- Проверены loading/empty/error/success/return и reload на ключевых границах.
- Visual audit по `references-new/` и control prototypes; только layout/spacing/type/color/components/copy fixes без нового behavior.
- Responsive 320/360/390 и принятые desktop widths; keyboard/focus/labels/reduced motion по возможностям stack.
- Release/handoff report с checks, artefacts, limitations и rollback.

## 4. Не входит в этап

- New features, IA redesign, API/schema changes ради polish.
- Registration, payments, teams, social publishing, embedded camera.
- Test/design framework replacement.
- Маскировка defects заглушками.

## 5. Критерии приёмки и проверки

- Critical E2E проходит от `/reels` до result и return; profile отдельно.
- Все immutable rules покрыты automated или явно manual check.
- Нет новых console errors, unhandled promises, hydration errors, horizontal overflow, keyboard traps.
- Visual fixes не изменяют API payloads, transitions, persistence.
- Reference comparison и допустимые deviations записаны.
- Existing tests/lint/typecheck/build проходят либо blockers согласованы.

## 6. Риски и известные ограничения

- Screenshot tests зависят от OS/font rendering; смотреть layout смысл, не только pixel diff.
- External AI/media делают E2E flaky; не скрывать flakiness бесконечными retries.
- Functional defect из polish исправлять отдельным diff с regression tests.

## 7. Промпт для Cursor

> Результат этапа проходит проверку у агента «Создание приложение» перед следующим шагом.


```text
В src/ выполни только P17 — E2E приёмка, затем visual polish без изменения продукта.

Сначала исследуй repo, package.json, existing test/e2e/screenshot stack, принятые routes и handoff notes. Прочитай канон в C:/Users/Благости/Desktop/План/Vocal_design_plan_2026-09-15/, особенно START_HERE.md, SOURCE_OF_TRUTH_2026-09-15.md, SHARED_DESIGN_BRIEF, SYNC_CHECK, SCREEN_STYLE_AUDIT, THOUGHT_JOURNEY_REVISION, DEVELOPMENT_READINESS, WORKING_CYCLE_CHECKPOINT, working-cycle-output/review.html и references-new/.

Сначала прогони/дополни functional matrix: create без profile; text/voice dialogue (voice не take); proposal/script/save; explicit record start; record с/без script; prepared-video upload; processing error/retry/reload; automatic AI comparison без A/B; independent final take/final script; profile draft не active до confirm; redirects; canonical P16 export. Проверь loading/empty/error/success/back/reload.

Только после зелёной matrix сделай узкий visual polish против references-new: tokens, Inter/Literata, spacing, hierarchy, responsive и states. Не меняй API payloads, schema, business rules, transitions. Новые features не добавляй. На записи сохраняй крупный script, compact stage и no AI chat.

Проверь 320/360/390/desktop, keyboard/focus/labels, touch ≥44, overflow, reduced motion, console/hydration/unhandled errors. Используй existing test/screenshot framework; новый не добавляй без необходимости. Запусти реальные tests/lint/typecheck/build scripts из package.json; names не выдумывай. Environment/pre-existing blockers отдельно, fake success запрещён.

Не commit/push/deploy без команды. Handoff: journeys/checks/results, visual files, screenshot artefacts, defects/risks, rollback, release readiness. Затем остановись.
```

## 8. Условие остановки

После итогового handoff остановиться; release/commit/push/deploy — только отдельной явной командой.

### Проверка агентом

После выполнения этапа передай результат в чат агента **«Создание приложение»** (Grok Bot). Не начинай следующий этап до вердикта: принято / правки / стоп.

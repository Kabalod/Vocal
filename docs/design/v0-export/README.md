# Эталон v0 (vocalv0 prototype)

Справочный экспорт прототипа. **Не часть приложения**: не собирается, не проверяется `tsc`, eslint и тестами, в продукт не импортируется. Файлы экспорта не менять.

- Источник: репозиторий `git@github.com:Kabalod/vocalv0.git`, ветка `main`.
- Коммит: `e27caf46f5f09f76eb887b8113473740867b01b1` («Add the ghost "next take" polaroid at the start of the takes path»), 13.10.2026 20:43 (+00:00).
- Скопировано 13.10.2026 командой `git archive e27caf4` (только отслеживаемые файлы; без `.git`, `node_modules`, `.codex/`, `AGENTS.md`, `README.md`, `next-env.d.ts`, `tsconfig.tsbuildinfo` — эти файлы в рабочей папке прототипа не закоммичены).
- Предыдущий экспорт (`47b0a22` ветки `feat/v0-design-prototype`, 10.10.2026) заменён целиком.

Исключён из: `tsconfig.json` (`exclude`), `eslint.config.mjs` (`ignores`). Тесты запускаются по явному списку файлов из `tests/`, эталон в них не попадает.

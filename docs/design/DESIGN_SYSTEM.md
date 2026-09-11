# Vocal Design System v2

Источник: `vocal_cursor_plan_2026-09-10/source_specs/UI_SPEC.md`, этап Stage 01.

## Направление

Тёмная editorial-студия. Один champagne-акцент, без неона, нижнего dock и отдельного tablet-layout.

## Токены

```css
--vocal-bg: #070707;
--vocal-surface: #151410;
--vocal-field: #201d18;
--vocal-text: #f3efe7;
--vocal-muted: #b8b0a3;
--vocal-accent: #d4a574;
--vocal-on-accent: #241a10;
--vocal-danger: #f0a39a;
--vocal-success: #9cc5a0;
--vocal-line: #34312b;
--vocal-input-border: #81796c;
--vocal-focus: #f0cd9d;
--vocal-radius-control: 10px;
--vocal-radius-panel: 16px;
--vocal-radius-modal: 20px;
```

Алиасы: `--bg`, `--bg-elev`, `--line`, `--text`, `--muted`, `--accent`, `--on-accent`, `--focus`, `--good`, `--bad`. Текст на champagne — `text-on-accent`, не сырой hex.

## Shell

- Два макета: `< 1200px` Sheet; `≥ 1200px` sidebar 200 px / 64 px.
- Состояние сворачивания в `localStorage` (`vocal-shell-collapsed`).
- Глобальная навигация: «Записи» и «Профиль». Нет нижнего dock.

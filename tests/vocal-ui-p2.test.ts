import "./helpers/react-global";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";
import { ActionButton } from "../src/components/vocal-ui/ActionButton";
import { ActionSheet } from "../src/components/vocal-ui/ActionSheet";
import { Chip } from "../src/components/vocal-ui/Chip";
import { Composer } from "../src/components/vocal-ui/Composer";
import { ConfirmAlert } from "../src/components/vocal-ui/ConfirmAlert";
import { handleDialogKeyDown } from "../src/components/vocal-ui/dialog-behavior";
import { IconButton } from "../src/components/vocal-ui/IconButton";
import { IosNavBar, isNavTitleVisible } from "../src/components/vocal-ui/IosNavBar";
import { MonthCalendar, dateFilterLabel, isoDay, monthGrid } from "../src/components/vocal-ui/MonthCalendar";
import { Panel } from "../src/components/vocal-ui/Panel";
import { ProgressBar, progressToneClass } from "../src/components/vocal-ui/ProgressBar";
import { SegmentedTabs } from "../src/components/vocal-ui/SegmentedTabs";
import { Sheet } from "../src/components/vocal-ui/Sheet";
import { StatusBadge } from "../src/components/vocal-ui/StatusBadge";
import { ConfirmActions, VocalModal } from "../src/components/vocal-ui/VocalModal";

const html = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node);
const noop = () => undefined;

test("SegmentedTabs text variant keeps tablist roles; icon variant has names, tooltips and the 28 px look with an extended target", () => {
  const items = [
    { id: "a", label: "Дубли", icon: createElement("i"), hint: "Дубли ⌘1" },
    { id: "b", label: "Диалог", icon: createElement("i") },
  ];
  const text = html(createElement(SegmentedTabs, { items, value: "a", onChange: noop }));
  assert.match(text, /role="tablist"/);
  assert.equal((text.match(/role="tab"/g) ?? []).length, 2);
  assert.match(text, /aria-selected="true"[^>]*tabindex="0"|tabindex="0"[^>]*aria-selected="true"/);
  assert.match(text, />Дубли</);
  const icon = html(createElement(SegmentedTabs, { items, value: "b", onChange: noop, variant: "icon", "aria-label": "Раздел" }));
  assert.match(icon, /aria-label="Раздел"/);
  assert.match(icon, /aria-label="Дубли"/);
  assert.match(icon, /title="Дубли ⌘1"/);
  assert.match(icon, /title="Диалог"/, "the tooltip defaults to the label");
  assert.match(icon, /h-7 w-9/);
  assert.match(icon, /after:-inset-1\.5/, "touch target extended around the 36×28 look");
  assert.doesNotMatch(icon, />Дубли</, "icon-only: no visible label text");
});

test("ActionButton variants: primary/secondary/ghost/danger, 44 px on touch and 32 px on the desktop shell", () => {
  for (const variant of ["primary", "secondary", "ghost", "danger"] as const) {
    const out = html(createElement(ActionButton, { variant }, "Текст"));
    assert.match(out, new RegExp(`data-variant="${variant}"`));
    assert.match(out, /min-h-11 min-w-11/);
    assert.match(out, /shell:min-h-8/);
  }
  assert.match(html(createElement(ActionButton, { variant: "primary" }, "Ок")), /min-h-12/);
  assert.match(html(createElement(ActionButton, { variant: "compact" }, "Ок")), /bg-transparent/, "compact stays as an alias of ghost");
  const loading = html(createElement(ActionButton, { loading: true, loadingLabel: "Создаём…" }, "Создать"));
  assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /disabled/);
});

test("IconButton always has an accessible name and a 44 px target (32 px on desktop)", () => {
  const out = html(createElement(IconButton, { label: "Закрыть" }, createElement("i")));
  assert.match(out, /aria-label="Закрыть"/);
  assert.match(out, /h-11 w-11/);
  assert.match(out, /shell:h-8 shell:w-8/);
});

test("Panel is the hairline card", () => {
  assert.match(html(createElement(Panel, null, "x")), /class="vocal-card /);
});

test("Composer: one button; microphone when empty, arrow when there is text; the hint under the pill", () => {
  const empty = html(createElement(Composer, { value: "", micLabel: "Ответить голосом" }));
  assert.match(empty, /aria-label="Ответить голосом"/);
  assert.doesNotMatch(empty, /aria-label="Отправить"/);
  assert.equal((empty.match(/<button/g) ?? []).length, 1);
  assert.match(empty, /Enter — отправить, Shift\+Enter — новая строка/);
  assert.match(empty, /aria-describedby=/);
  const typed = html(createElement(Composer, { value: "Привет" }));
  assert.match(typed, /aria-label="Отправить"/);
  assert.match(typed, /type="submit"/);
  assert.doesNotMatch(typed, /aria-label="Записать голос"/);
  assert.equal((typed.match(/<button/g) ?? []).length, 1);
  const disabledText = html(createElement(Composer, { value: "Привет", disabled: true }));
  assert.doesNotMatch(disabledText, /aria-label="Отправить"/, "disabled composer never offers to send");
  assert.match(html(createElement(Composer, { error: true })), /aria-invalid="true"/);
});

test("StatusBadge: a dot in the status colour and the label as text", () => {
  const out = html(createElement(StatusBadge, { status: "in_progress" }));
  assert.match(out, /data-status="in_progress"/);
  assert.match(out, /var\(--status-progress\)/);
  assert.match(out, /В работе/);
  assert.match(html(createElement(StatusBadge, { status: "completed" })), />Завершена</);
});

test("ProgressBar: role=progressbar, clamped value, colour by thresholds in the usage tone", () => {
  const out = html(createElement(ProgressBar, { value: 150, label: "Ресурс", tone: "usage", showValue: true }));
  assert.match(out, /role="progressbar"/);
  assert.match(out, /aria-valuenow="100"/);
  assert.match(out, /aria-label="Ресурс"/);
  assert.match(out, /bg-bad/);
  assert.equal(progressToneClass(40, "usage"), "bg-accent");
  assert.equal(progressToneClass(70, "usage"), "bg-[var(--status-progress)]");
  assert.equal(progressToneClass(90, "usage"), "bg-bad");
  assert.equal(progressToneClass(95, "accent"), "bg-accent", "the accent tone never changes colour");
  assert.match(html(createElement(ProgressBar, { value: Number.NaN, label: "x" })), /aria-valuenow="0"/);
});

test("Chip: pressed state, and a removable chip with a named × button", () => {
  assert.match(html(createElement(Chip, { selected: true }, "Сегодня")), /aria-pressed="true"/);
  assert.match(html(createElement(Chip, null, "Вчера")), /aria-pressed="false"/);
  const removable = html(createElement(Chip, { onRemove: noop }, "Октябрь 2026"));
  assert.match(removable, /aria-label="Убрать: Октябрь 2026"/);
  assert.match(removable, /data-chip="removable"/);
});

test("MonthCalendar: grid, labels, today, dots, selected day, reset only when a filter is set", () => {
  assert.deepEqual(monthGrid(2026, 9), { offset: 3, days: 31 }, "1 Oct 2026 is a Thursday: three blanks, Monday first");
  assert.equal(isoDay(2026, 9, 5), "2026-10-05");
  assert.equal(dateFilterLabel("range", "2026-10-09", ""), "9 октября");
  assert.equal(dateFilterLabel("month", "", "2026-10"), "Октябрь 2026");
  const base = {
    year: 2026, month: 9, today: "2026-10-14", marked: new Set(["2026-10-09"]), rangeStart: "2026-10-09", monthValue: "",
    onMonthChange: noop, onPreset: noop, onDay: noop, onWholeMonth: noop, onReset: noop,
  };
  const out = html(createElement(MonthCalendar, { ...base, dateFilter: "range" }));
  assert.match(out, /Октябрь 2026/);
  assert.equal((out.match(/data-day=/g) ?? []).length, 31);
  assert.match(out, /aria-label="14 октября, сегодня"/);
  assert.match(out, /aria-label="9 октября, есть мысли"/);
  assert.match(out, /data-day="2026-10-09"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-day="2026-10-09"/);
  assert.match(out, /Сбросить/);
  assert.match(out, /aria-label="Предыдущий месяц"/);
  assert.match(out, /aria-label="Следующий месяц"/);
  assert.match(out, /Весь месяц/);
  assert.doesNotMatch(html(createElement(MonthCalendar, { ...base, dateFilter: "all", rangeStart: "" })), /Сбросить/);
  const month = html(createElement(MonthCalendar, { ...base, dateFilter: "month", monthValue: "2026-10", rangeStart: "" }));
  assert.match(month, /aria-pressed="true"[^>]*>Весь месяц|aria-pressed="true"[^>]*class="[^"]*"[^>]*>Весь месяц/);
});

test("overlays: closed renders nothing; open: dialog roles, names, grabber, backdrop out of the tab order", () => {
  assert.equal(html(createElement(Sheet, { open: false, title: "Дата", onClose: noop }, "x")), "");
  const sheet = html(createElement(Sheet, { open: true, title: "Дата", onClose: noop }, "Тело"));
  assert.match(sheet, /role="dialog"/);
  assert.match(sheet, /aria-modal="true"/);
  assert.match(sheet, /aria-labelledby=/);
  assert.match(sheet, />Дата</);
  assert.match(sheet, /w-9 rounded-full/, "grabber");
  assert.match(sheet, /class="absolute inset-0 bg-black\/50" aria-hidden="true"/);

  const modal = html(createElement(VocalModal, { open: true, title: "Новая мысль", onClose: noop }, "Тело"));
  assert.match(modal, /role="dialog"/);
  assert.match(modal, /aria-label="Закрыть"/);
  assert.match(modal, /shell:hidden/, "the grabber is for the mobile sheet only");
  assert.match(modal, /shell:items-center/, "centered on desktop, bottom sheet below the shell breakpoint");
  assert.match(html(createElement(ConfirmActions, { onCancel: noop, onConfirm: noop, confirmLabel: "Удалить" })), /data-vocal-initial="safe"/);

  const actions = [{ id: "a", label: "Записать дубль" }, { id: "d", label: "Удалить мысль", destructive: true }];
  const sheetOut = html(createElement(ActionSheet, { open: true, title: "Мысль", actions, onSelect: noop, onClose: noop }));
  assert.match(sheetOut, /Записать дубль/);
  assert.match(sheetOut, /text-bad[^>]*>Удалить мысль|text-bad hover[^>]*>Удалить мысль/);
  assert.match(sheetOut, />Отмена</);

  const alert = html(createElement(ConfirmAlert, { open: true, title: "Удалить мысль?", message: "Нельзя вернуть.", confirmLabel: "Удалить", destructive: true, onConfirm: noop, onCancel: noop }));
  assert.match(alert, /role="alertdialog"/);
  assert.match(alert, /aria-describedby=/);
  assert.match(alert, /data-vocal-initial="safe"[^>]*>Отмена</, "the safe answer is the initial focus");
  assert.match(alert, /text-bad[^>]*>Удалить</);
});

test("overlay keyboard: Escape closes, Tab is trapped (cycles) inside the panel", () => {
  let closed = 0;
  let prevented = 0;
  const event = (key: string, shiftKey = false) => ({ key, shiftKey, preventDefault: () => { prevented += 1; } });
  const button = (name: string) => ({ name, tabIndex: 0, hasAttribute: () => false, getAttribute: () => null, hidden: false, focus() { focused = name; } });
  let focused = "";
  const first = button("first");
  const last = button("last");
  const panel = { querySelectorAll: () => [first, last] } as unknown as ParentNode;

  assert.equal(handleDialogKeyDown(event("Escape"), panel, first as never, () => { closed += 1; }), "close");
  assert.equal(closed, 1);
  assert.equal(handleDialogKeyDown(event("Tab"), panel, last as never, () => undefined), "trap");
  assert.equal(focused, "first", "Tab on the last control wraps to the first");
  assert.equal(handleDialogKeyDown(event("Tab", true), panel, first as never, () => undefined), "trap");
  assert.equal(focused, "last", "Shift+Tab on the first control wraps to the last");
  assert.equal(handleDialogKeyDown(event("a"), panel, first as never, () => undefined), null);
  assert.ok(prevented >= 3);
});

test("IosNavBar: 44 px bar under the safe area, back control, the title appears with scrolling", () => {
  assert.equal(isNavTitleVisible(0), false);
  assert.equal(isNavTitleVisible(24), false);
  assert.equal(isNavTitleVisible(25), true);
  const hidden = html(createElement(IosNavBar, { title: "Привычка", backLabel: "Мысли", onBack: noop, titleVisible: false }));
  assert.match(hidden, /h-11/);
  assert.match(hidden, /safe-area-inset-top/);
  assert.match(hidden, /data-title-visible="false"/);
  assert.match(hidden, /opacity-0/);
  assert.match(hidden, /aria-hidden="true"[^>]*>Привычка|>Привычка</);
  assert.match(hidden, /‹/);
  assert.match(hidden, />Мысли</);
  const shown = html(createElement(IosNavBar, { title: "Привычка", onBack: noop, titleVisible: true }));
  assert.match(shown, /data-title-visible="true"/);
  assert.match(shown, /opacity-100/);
  assert.match(shown, />Назад</);
});

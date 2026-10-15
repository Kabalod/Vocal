import "./helpers/react-global";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ArchiveMobileRow, archiveRowMeta } from "../src/components/ArchiveMobileRow";
import { ArchivePolaroidCard } from "../src/components/ArchivePolaroidCard";
import { ArchiveStatusFilters } from "../src/components/ArchiveStatusFilters";
import { DEFAULT_ARCHIVE_DENSITY } from "../src/lib/archive-density";
import { libraryDateFilter, libraryDateLabel, presetRange, thoughtsCountLabel } from "../src/lib/library-date";
import type { ReelListItemDto } from "../src/types/reel";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const NOW = new Date("2026-10-15T09:30:00.000Z");

function reel(patch: Partial<ReelListItemDto> = {}): ReelListItemDto {
  return {
    id: "r1",
    title: "Привычка и мотивация",
    status: "in_progress",
    statusGroup: "in_progress",
    preview: "",
    takeCount: 3,
    hasScript: true,
    createdAt: "2026-10-09T10:00:00.000Z",
    updatedAt: "2026-10-09T10:00:00.000Z",
    ...patch,
  } as ReelListItemDto;
}

test("date presets are whole local days and come back from the URL range as the same preset", () => {
  for (const timeZone of ["UTC", "Europe/Moscow", "America/Los_Angeles"]) {
    const today = presetRange("today", timeZone, NOW);
    const yesterday = presetRange("yesterday", timeZone, NOW);
    const week = presetRange("week", timeZone, NOW);
    assert.equal(Date.parse(today.to) - Date.parse(today.from), 24 * 3600_000, timeZone);
    assert.equal(yesterday.to, today.from, "yesterday ends where today starts");
    assert.equal(week.to, today.to);
    assert.equal(Date.parse(week.to) - Date.parse(week.from), 7 * 24 * 3600_000);
    assert.equal(libraryDateFilter(today.from, today.to, timeZone, NOW).kind, "today");
    assert.equal(libraryDateFilter(yesterday.from, yesterday.to, timeZone, NOW).kind, "yesterday");
    assert.equal(libraryDateFilter(week.from, week.to, timeZone, NOW).kind, "week");
  }
});

test("a day and a month from the calendar map back to the calendar's selection and the chip label", () => {
  const tz = "UTC";
  assert.deepEqual(libraryDateFilter(null, null, tz, NOW), { kind: "all", rangeStart: "", monthValue: "" });
  const day = libraryDateFilter("2026-10-03T00:00:00.000Z", "2026-10-04T00:00:00.000Z", tz, NOW);
  assert.deepEqual(day, { kind: "range", rangeStart: "2026-10-03", monthValue: "" });
  assert.equal(libraryDateLabel(day, "2026-10-03T00:00:00.000Z", "2026-10-04T00:00:00.000Z", tz), "3 октября");
  const month = libraryDateFilter("2026-09-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z", tz, NOW);
  assert.deepEqual(month, { kind: "month", rangeStart: "", monthValue: "2026-09" });
  assert.equal(libraryDateLabel(month, "2026-09-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z", tz), "Сентябрь 2026");
  const custom = libraryDateFilter("2026-10-01T00:00:00.000Z", "2026-10-06T00:00:00.000Z", tz, NOW);
  assert.equal(custom.kind, "range");
  assert.equal(libraryDateLabel(custom, "2026-10-01T00:00:00.000Z", "2026-10-06T00:00:00.000Z", tz), "1 октября — 5 октября");
  assert.equal(libraryDateLabel({ kind: "all", rangeStart: "", monthValue: "" }, null, null, tz), "");
});

test("count label", () => {
  assert.deepEqual([1, 2, 5, 11, 12, 21, 22, 25, 111].map(thoughtsCountLabel), ["мысль", "мысли", "мыслей", "мыслей", "мыслей", "мысль", "мысли", "мыслей", "мыслей"]);
});

test("the polaroid: «i» opens the preview, the rest is one link to the thought, the status is a mark", () => {
  const html = renderToStaticMarkup(createElement(ArchivePolaroidCard, { reel: reel(), onOpenPreview: () => undefined }));
  assert.match(html, /<button[^>]*aria-label="Предпросмотр мысли «Привычка и мотивация»"/);
  assert.match(html, /<a[^>]*aria-label="Открыть мысль «Привычка и мотивация»"[^>]*href="\/reels\/r1\?tab=dialog"/);
  assert.match(html, /role="img"[^>]*aria-label="В работе"/);
  assert.equal((html.match(/<button/g) ?? []).length, 1, "the card has no other button");
  assert.ok(html.indexOf("Привычка и мотивация</p>") > html.indexOf("<a "), "the title is inside the link");
});

test("the touch row: mini polaroid, title, one meta line, its own preview button", () => {
  const html = renderToStaticMarkup(createElement("ul", null, createElement(ArchiveMobileRow, { reel: reel(), onOpenPreview: () => undefined })));
  assert.match(html, /archive-row-thumb/);
  assert.match(html, /В работе · 3 дубля · 9 окт/);
  assert.match(html, /<button[^>]*aria-label="Предпросмотр мысли «Привычка и мотивация»"/);
  assert.deepEqual(archiveRowMeta(reel({ takeCount: 0, statusGroup: "completed" })).status, "Завершена");
});

test("status filters: chips lane on touch, three status marks in the sidebar", () => {
  const chips = renderToStaticMarkup(createElement(ArchiveStatusFilters, { variant: "chips", value: "all", onChange: () => undefined }));
  for (const label of ["Все", "Не завершена", "В работе", "Завершена"]) assert.match(chips, new RegExp(label));
  assert.match(chips, /archive-status-chips/);
  assert.match(chips, /aria-pressed="true"/);
  const side = renderToStaticMarkup(createElement(ArchiveStatusFilters, { value: "in_progress", onChange: () => undefined }));
  assert.match(side, /СТАТУС|Статус/);
  assert.equal((side.match(/<circle/g) ?? []).length, 3, "open / half / check circles");
});

test("wiring: sidebar order, calendar from P2, grid by default with a secondary switch, no command palette, empty states", () => {
  const list = read("src/components/ReelList.tsx");
  const shell = read("src/components/VocalAppShell.tsx");
  const calendar = read("src/components/ArchiveCalendar.tsx");
  const toggle = read("src/components/ArchiveDensityToggle.tsx");
  assert.equal(DEFAULT_ARCHIVE_DENSITY, "compact");
  assert.ok(toggle.indexOf('label: "Сетка"') < toggle.indexOf('label: "Стол"') && toggle.indexOf('label: "Стол"') < toggle.indexOf('label: "Список"'));
  assert.match(calendar, /MonthCalendar/);
  assert.match(calendar, /\/api\/reels\/calendar/);
  assert.match(calendar, /onPreset/);
  assert.match(calendar, /onReset=\{onClearDate\}/);
  // sidebar: nav "Мысли", then status, then date, profile at the bottom
  const nav = shell.indexOf("setStatusHost}");
  assert.ok(shell.indexOf('aria-label="Разделы"') < nav && nav < shell.indexOf("setDateHost}") && shell.indexOf("setDateHost}") < shell.indexOf('aria-label="Профиль"'));
  assert.match(list, /data-archive-active-date/);
  assert.match(list, /Сбросить фильтр по дате/);
  assert.match(list, /На столе сейчас/);
  assert.match(list, /Запишите первую мысль/);
  assert.match(list, /Ничего не найдено/);
  assert.match(list, /Сбросить фильтры/);
  assert.doesNotMatch(list + shell, /⌘K|metaKey|ctrlKey/);
  // bottom tab bar: Мысли / mic / Профиль with safe-area, mic opens the new-thought sheet
  assert.match(shell, /data-tabbar-new/);
  assert.match(shell, /safe-area-inset-bottom/);
  assert.match(shell, /NewThoughtSheet/);
  // logic and API are untouched: the same query builder and the same endpoint
  assert.match(list, /buildArchiveListApiQuery/);
  assert.match(list, /fetch\(`\/api\/reels\?\$\{queryString\}`/);
});

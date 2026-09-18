import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  buildCalendarCells,
  dayRangeForOffset,
  matchArchiveDateSelection,
  monthFilterRangeForOffset,
  shiftMonthKey,
} from "../src/lib/archive-calendar";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tz = 180;

test("P01.3 day/month ranges and selection match use absolute bounds", () => {
  const day = dayRangeForOffset("2026-09-17", tz);
  assert.equal(day.from, "2026-09-16T21:00:00.000Z");
  assert.equal(day.to, "2026-09-17T21:00:00.000Z");

  const month = monthFilterRangeForOffset("2026-09", tz);
  assert.equal(month.from, "2026-08-31T21:00:00.000Z");
  assert.equal(month.to, "2026-09-30T21:00:00.000Z");

  assert.deepEqual(matchArchiveDateSelection(day.from, day.to, tz), {
    kind: "day",
    day: "2026-09-17",
  });
  assert.deepEqual(matchArchiveDateSelection(month.from, month.to, tz), {
    kind: "month",
    month: "2026-09",
  });
  assert.equal(
    matchArchiveDateSelection("2026-09-16T21:00:00.000Z", "2026-09-18T21:00:00.000Z", tz),
    null,
  );
  assert.equal(shiftMonthKey("2026-09", 1), "2026-10");
  assert.equal(shiftMonthKey("2026-01", -1), "2025-12");
});

test("P01.3 calendar grid is Monday-first and marks in-month days", () => {
  const cells = buildCalendarCells("2026-09", tz);
  assert.equal(cells.length % 7, 0);
  const firstIn = cells.find((cell) => cell.inMonth);
  assert.ok(firstIn);
  assert.equal(firstIn.date, "2026-09-01");
  // 2026-09-01 is Tuesday → one leading Monday cell
  assert.equal(cells[0]?.inMonth, false);
  assert.equal(cells[1]?.date, "2026-09-01");
  assert.ok(cells.some((cell) => cell.date === "2026-09-30" && cell.inMonth));
});

test("P01.3 desktop archive wires calendar, status icons, polaroids without mobile sheet/preview", () => {
  const list = readFileSync(join(root, "src/components/ReelList.tsx"), "utf8");
  const calendar = readFileSync(join(root, "src/components/ArchiveCalendar.tsx"), "utf8");
  const card = readFileSync(join(root, "src/components/ArchivePolaroidCard.tsx"), "utf8");
  const css = readFileSync(join(root, "src/app/globals.css"), "utf8");

  assert.match(list, /ArchiveCalendar/);
  assert.match(list, /ArchiveStatusFilters/);
  assert.match(list, /ArchivePolaroidCard/);
  assert.match(list, /hidden shell:block/);
  assert.match(calendar, /Показать месяц/);
  assert.match(calendar, /Сбросить дату/);
  assert.match(calendar, /\/api\/reels\/calendar/);
  assert.match(calendar, /aria-selected/);
  assert.match(calendar, /Предыдущий месяц/);
  assert.equal(calendar.includes("bottom sheet"), false);
  assert.equal(calendar.includes("bottom-sheet"), false);
  assert.match(card, /archive-polaroid/);
  assert.match(card, /aspect-ratio|archive-polaroid-frame/);
  assert.match(card, /aria-label="Подробнее/);
  assert.match(card, /disabled/);
  assert.equal(card.includes("сердц"), false);
  assert.equal(card.includes("избран"), false);
  assert.match(css, /\.archive-polaroid:hover/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /\.archive-polaroid:hover,\s*\n\s*\.archive-polaroid:focus-within/);
});

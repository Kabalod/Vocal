import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  buildCalendarCells,
  dayRangeInTimeZone,
  matchArchiveDateSelection,
  monthFilterRangeInTimeZone,
  shiftMonthKey,
} from "../src/lib/archive-calendar";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const helsinki = "Europe/Helsinki";

test("P01.3 IANA day/month ranges stay correct in summer, winter, and DST", () => {
  const summerDay = dayRangeInTimeZone("2026-09-17", helsinki);
  assert.equal(summerDay.from, "2026-09-16T21:00:00.000Z");
  assert.equal(summerDay.to, "2026-09-17T21:00:00.000Z");
  assert.equal(Date.parse(summerDay.to) - Date.parse(summerDay.from), 24 * 60 * 60 * 1000);

  const winterMonth = monthFilterRangeInTimeZone("2026-01", helsinki);
  assert.equal(winterMonth.from, "2025-12-31T22:00:00.000Z");
  assert.equal(winterMonth.to, "2026-01-31T22:00:00.000Z");
  // A September-style +180 offset would start January an hour too early.
  assert.notEqual(winterMonth.from, "2025-12-31T21:00:00.000Z");

  const springForward = dayRangeInTimeZone("2026-03-29", helsinki);
  assert.equal(springForward.from, "2026-03-28T22:00:00.000Z");
  assert.equal(springForward.to, "2026-03-29T21:00:00.000Z");
  assert.equal(Date.parse(springForward.to) - Date.parse(springForward.from), 23 * 60 * 60 * 1000);

  const fallBack = dayRangeInTimeZone("2026-10-25", helsinki);
  assert.equal(fallBack.from, "2026-10-24T21:00:00.000Z");
  assert.equal(fallBack.to, "2026-10-25T22:00:00.000Z");
  assert.equal(Date.parse(fallBack.to) - Date.parse(fallBack.from), 25 * 60 * 60 * 1000);

  const march = monthFilterRangeInTimeZone("2026-03", helsinki);
  assert.equal(march.from, "2026-02-28T22:00:00.000Z");
  assert.equal(march.to, "2026-03-31T21:00:00.000Z");

  assert.deepEqual(matchArchiveDateSelection(summerDay.from, summerDay.to, helsinki), {
    kind: "day",
    day: "2026-09-17",
  });
  assert.deepEqual(matchArchiveDateSelection(winterMonth.from, winterMonth.to, helsinki), {
    kind: "month",
    month: "2026-01",
  });
  assert.equal(shiftMonthKey("2026-09", 1), "2026-10");
  assert.equal(shiftMonthKey("2026-01", -1), "2025-12");
});

test("P01.3 calendar grid is Monday-first and marks in-month days", () => {
  const cells = buildCalendarCells("2026-09", helsinki);
  assert.equal(cells.length % 7, 0);
  const firstIn = cells.find((cell) => cell.inMonth);
  assert.ok(firstIn);
  assert.equal(firstIn.date, "2026-09-01");
  assert.equal(cells[0]?.inMonth, false);
  assert.equal(cells[1]?.date, "2026-09-01");
  assert.ok(cells.some((cell) => cell.date === "2026-09-30" && cell.inMonth));
});

test("P01.3 desktop archive stays desktop-only with polaroid composition and simple calendar buttons", () => {
  const list = readFileSync(join(root, "src/components/ReelList.tsx"), "utf8");
  const calendar = readFileSync(join(root, "src/components/ArchiveCalendar.tsx"), "utf8");
  const card = readFileSync(join(root, "src/components/ArchivePolaroidCard.tsx"), "utf8");
  const css = readFileSync(join(root, "src/app/globals.css"), "utf8");

  assert.match(list, /useShellDesktop/);
  assert.match(list, /isDesktop \? \(/);
  assert.match(list, /<ArchiveCalendar/);
  assert.match(list, /ArchivePolaroidCard/);
  assert.equal(list.includes("<ReelCard"), false);
  assert.match(calendar, /Показать месяц/);
  assert.match(calendar, /timeZone/);
  assert.match(calendar, /\/api\/reels\/calendar/);
  assert.equal(calendar.includes('role="grid"'), false);
  assert.equal(calendar.includes("gridcell"), false);
  assert.equal(calendar.includes("bottom sheet"), false);
  assert.match(card, /archive-polaroid-info/);
  assert.match(card, /archive-polaroid-status/);
  assert.equal(card.includes("formatDate"), false);
  assert.equal(card.includes("сердц"), false);
  assert.match(css, /left:\s*0\.85rem/);
  assert.match(css, /\.archive-polaroid-status[\s\S]*right:\s*0\.7rem/);
  assert.match(css, /\.archive-polaroid-footer[\s\S]*justify-content:\s*center/);
  assert.match(css, /prefers-reduced-motion/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  dayRangeInTimeZone,
  formatArchiveDateHeading,
  monthFilterRangeInTimeZone,
} from "../src/lib/archive-calendar";
import { studioThoughtHref } from "../src/components/reel-studio";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const helsinki = "Europe/Helsinki";

test("P01.4 date heading distinguishes today, selected day and month", () => {
  const day = dayRangeInTimeZone("2026-09-17", helsinki);
  const heading = formatArchiveDateHeading(day.from, day.to, helsinki);
  assert.equal(heading.selected, true);
  assert.match(heading.title, /17/);
  assert.match(heading.title, /сентябр/i);
  assert.ok(heading.subtitle.length > 0);

  const month = monthFilterRangeInTimeZone("2026-09", helsinki);
  const monthHeading = formatArchiveDateHeading(month.from, month.to, helsinki);
  assert.equal(monthHeading.selected, true);
  assert.match(monthHeading.title, /2026/);
  assert.equal(monthHeading.subtitle, "Весь месяц");
});

test("P01.4 mobile archive uses 3-col polaroids, two controls, and calendar sheet", () => {
  const list = readFileSync(join(root, "src/components/ReelList.tsx"), "utf8");
  const card = readFileSync(join(root, "src/components/ArchivePolaroidCard.tsx"), "utf8");
  const sheet = readFileSync(join(root, "src/components/ArchiveCalendarSheet.tsx"), "utf8");
  const css = readFileSync(join(root, "src/app/globals.css"), "utf8");
  const modal = readFileSync(join(root, "src/components/vocal-ui/VocalModal.tsx"), "utf8");

  assert.match(list, /archive-polaroid-grid-mobile/);
  assert.match(list, /variant="mobile"/);
  assert.match(list, /ArchiveCalendarSheet/);
  assert.match(list, /calendarOpen/);
  assert.match(list, /Открыть календарь/);
  assert.match(list, /safe-area-inset-bottom/);
  assert.equal(list.includes("<ReelCard"), false);
  assert.match(card, /variant === "mobile"/);
  assert.match(card, /archive-polaroid-preview/);
  assert.match(card, /stopPropagation/);
  assert.match(card, /studioThoughtHref\(reel\.id, "dialog"\)/);
  assert.equal(studioThoughtHref("abc", "dialog"), "/reels/abc?tab=dialog");
  assert.match(sheet, /placement="sheet"/);
  assert.match(sheet, /trapSheetTab|VocalModal/);
  assert.match(sheet, /popstate/);
  assert.match(sheet, /ArchiveCalendar/);
  assert.match(css, /archive-polaroid-grid-mobile/);
  assert.match(css, /repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(min-width: 75rem\)/);
  assert.match(modal, /safe-area-inset-bottom/);
});

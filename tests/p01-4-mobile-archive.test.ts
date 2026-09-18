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
import {
  applyArchiveCalendarRange,
  archiveListHref,
  clearArchiveCalendarRange,
  defaultArchiveListUrlState,
  openArchiveCalendar,
  parseArchiveListUrl,
  type ArchiveListUrlState,
} from "../src/lib/thought-archive-state";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const helsinki = "Europe/Helsinki";

class ArchiveHistory {
  stack: string[] = ["/reels"];

  href() {
    return this.stack[this.stack.length - 1] ?? "/reels";
  }

  state(): ArchiveListUrlState {
    const url = new URL(this.href(), "https://vocal.local");
    return parseArchiveListUrl(url.searchParams);
  }

  push(next: ArchiveListUrlState) {
    this.stack.push(archiveListHref(next));
  }

  replace(next: ArchiveListUrlState) {
    this.stack[this.stack.length - 1] = archiveListHref(next);
  }

  back() {
    if (this.stack.length > 1) this.stack.pop();
  }
}

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

test("P01.4 picking a day replaces calendar=1 and keeps the range after close", () => {
  const day = dayRangeInTimeZone("2026-09-17", helsinki);
  const history = new ArchiveHistory();
  history.replace({ ...defaultArchiveListUrlState(), q: "альфа", status: "idea" });
  history.push(openArchiveCalendar(history.state()));
  assert.equal(history.state().calendarOpen, true);
  assert.equal(history.state().from, null);

  history.replace(applyArchiveCalendarRange(history.state(), day));
  const after = history.state();
  assert.equal(after.calendarOpen, false);
  assert.equal(after.from, day.from);
  assert.equal(after.to, day.to);
  assert.equal(after.q, "альфа");
  assert.equal(after.status, "idea");
  assert.equal(after.dateField, null);
  assert.equal(history.stack.length, 2);
  assert.equal(archiveListHref(after).includes("calendar="), false);
});

test("P01.4 picking a month keeps the month range after the sheet closes", () => {
  const month = monthFilterRangeInTimeZone("2026-09", helsinki);
  const history = new ArchiveHistory();
  history.replace(defaultArchiveListUrlState());
  history.push(openArchiveCalendar(history.state()));
  history.replace(applyArchiveCalendarRange(history.state(), month));
  const after = history.state();
  assert.equal(after.calendarOpen, false);
  assert.equal(after.from, month.from);
  assert.equal(after.to, month.to);
});

test("P01.4 clearing a date drops from/to and calendar=1 without a stray history entry", () => {
  const day = dayRangeInTimeZone("2026-09-17", helsinki);
  const history = new ArchiveHistory();
  history.replace({
    ...defaultArchiveListUrlState(),
    from: day.from,
    to: day.to,
  });
  history.push(openArchiveCalendar(history.state()));
  history.replace(clearArchiveCalendarRange(history.state()));
  const after = history.state();
  assert.equal(after.calendarOpen, false);
  assert.equal(after.from, null);
  assert.equal(after.to, null);
  assert.equal(archiveListHref(after), "/reels");
  assert.equal(history.stack.length, 2);
});

test("P01.4 Back/Escape/overlay pops calendar=1 and leaves filters unchanged", () => {
  const day = dayRangeInTimeZone("2026-09-17", helsinki);
  const history = new ArchiveHistory();
  history.replace({
    ...defaultArchiveListUrlState(),
    q: "бета",
    status: "completed",
    sort: "title",
    from: day.from,
    to: day.to,
  });
  const before = history.state();
  history.push(openArchiveCalendar(before));
  assert.equal(history.state().calendarOpen, true);
  history.back();
  const after = history.state();
  assert.equal(after.calendarOpen, false);
  assert.equal(after.q, "бета");
  assert.equal(after.status, "completed");
  assert.equal(after.sort, "title");
  assert.equal(after.from, day.from);
  assert.equal(after.to, day.to);
});

test("P01.4 mobile archive uses 3-col polaroids, URL calendar sheet, and named status outside preview", () => {
  const list = readFileSync(join(root, "src/components/ReelList.tsx"), "utf8");
  const card = readFileSync(join(root, "src/components/ArchivePolaroidCard.tsx"), "utf8");
  const sheet = readFileSync(join(root, "src/components/ArchiveCalendarSheet.tsx"), "utf8");
  const css = readFileSync(join(root, "src/app/globals.css"), "utf8");
  const modal = readFileSync(join(root, "src/components/vocal-ui/VocalModal.tsx"), "utf8");

  assert.match(list, /archive-polaroid-grid-mobile/);
  assert.match(list, /variant="mobile"/);
  assert.match(list, /ArchiveCalendarSheet/);
  assert.match(list, /calendarOpen/);
  assert.match(list, /openArchiveCalendar/);
  assert.match(list, /applyArchiveCalendarRange/);
  assert.match(list, /router\.push/);
  assert.match(list, /router\.back\(\)/);
  assert.match(list, /Открыть календарь/);
  assert.match(list, /safe-area-inset-bottom/);
  assert.equal(list.includes("<ReelCard"), false);
  assert.match(card, /variant === "mobile"/);
  assert.match(card, /archive-polaroid-preview/);
  assert.match(card, /role="img"/);
  assert.match(card, /aria-label=\{statusLabel\}/);
  assert.match(card, /PolaroidStatus[\s\S]*archive-polaroid-preview/);
  assert.doesNotMatch(
    card,
    /archive-polaroid-preview[\s\S]*PolaroidStatus[\s\S]*<\/button>/,
  );
  assert.match(card, /stopPropagation/);
  assert.match(card, /studioThoughtHref\(reel\.id, "dialog"\)/);
  assert.equal(studioThoughtHref("abc", "dialog"), "/reels/abc?tab=dialog");
  assert.match(sheet, /placement="sheet"/);
  assert.match(sheet, /trapSheetTab|VocalModal/);
  assert.match(sheet, /ArchiveCalendar/);
  assert.equal(sheet.includes("pushState"), false);
  assert.equal(sheet.includes("history.back"), false);
  assert.equal(sheet.includes("popstate"), false);
  assert.match(css, /archive-polaroid-grid-mobile/);
  assert.match(css, /repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(min-width: 75rem\)/);
  assert.match(modal, /safe-area-inset-bottom/);
});

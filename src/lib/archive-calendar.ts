/**
 * P01.3 — desktop calendar helpers using IANA time zones.
 * Local day/month bounds are [from, to) at that zone's midnights, including DST 23h/25h days.
 */

import { parseCalendarMonth } from "@/lib/reel-archive-query";

export function resolveClientTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function assertValidTimeZone(timeZone: string): string {
  const tz = timeZone.trim();
  if (!tz) {
    throw new Error("Некорректный timeZone.");
  }
  try {
    Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date(0));
    return tz;
  } catch {
    throw new Error("Некорректный timeZone.");
  }
}

function zonedParts(instant: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/** Milliseconds east of UTC at this instant in `timeZone`. */
export function zonedOffsetMs(instant: Date, timeZone: string): number {
  const local = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  return asUtc - instant.getTime();
}

export function tzOffsetMinutesAt(instant: Date, timeZone: string): number {
  return Math.round(zonedOffsetMs(instant, timeZone) / 60_000);
}

export function addCalendarDate(
  year: number,
  month: number,
  day: number,
  deltaDays: number,
): { year: number; month: number; day: number } {
  const utc = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() };
}

export function zonedMidnightUtc(
  year: number,
  month: number,
  day: number,
  timeZone: string,
): Date {
  let utcMs = Date.UTC(year, month - 1, day, 0, 0, 0);
  for (let i = 0; i < 4; i += 1) {
    const offset = zonedOffsetMs(new Date(utcMs), timeZone);
    utcMs = Date.UTC(year, month - 1, day, 0, 0, 0) - offset;
  }
  return new Date(utcMs);
}

export function shiftMonthKey(monthKey: string, delta: number): string {
  const { year, month } = parseCalendarMonth(monthKey);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function dayKeyFromInstant(instant: Date, timeZone: string): string {
  const local = zonedParts(instant, timeZone);
  return `${local.year}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}`;
}

export function monthKeyFromInstant(instant: Date, timeZone: string): string {
  return dayKeyFromInstant(instant, timeZone).slice(0, 7);
}

export function dayRangeInTimeZone(
  dayKey: string,
  timeZone: string,
): { from: string; to: string; day: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey.trim());
  if (!match) {
    throw new Error("День календаря в формате YYYY-MM-DD.");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const next = addCalendarDate(year, month, day, 1);
  const from = zonedMidnightUtc(year, month, day, timeZone);
  const to = zonedMidnightUtc(next.year, next.month, next.day, timeZone);
  return {
    day: `${match[1]}-${match[2]}-${match[3]}`,
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

export function monthRangeInTimeZone(
  monthKey: string,
  timeZone: string,
): { from: Date; to: Date; month: string } {
  const { year, month, key } = parseCalendarMonth(monthKey);
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  return {
    month: key,
    from: zonedMidnightUtc(year, month, 1, timeZone),
    to: zonedMidnightUtc(next.year, next.month, 1, timeZone),
  };
}

export function monthFilterRangeInTimeZone(
  monthKey: string,
  timeZone: string,
): { from: string; to: string; month: string } {
  const range = monthRangeInTimeZone(monthKey, timeZone);
  return {
    month: range.month,
    from: range.from.toISOString(),
    to: range.to.toISOString(),
  };
}

export type ArchiveDateSelection =
  | { kind: "day"; day: string }
  | { kind: "month"; month: string };

export function matchArchiveDateSelection(
  from: string | null | undefined,
  to: string | null | undefined,
  timeZone: string,
): ArchiveDateSelection | null {
  if (!from?.trim() || !to?.trim()) return null;
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;

  const dayKey = dayKeyFromInstant(new Date(fromMs), timeZone);
  try {
    const day = dayRangeInTimeZone(dayKey, timeZone);
    if (Date.parse(day.from) === fromMs && Date.parse(day.to) === toMs) {
      return { kind: "day", day: day.day };
    }
  } catch {
    /* fall through */
  }

  const monthKey = monthKeyFromInstant(new Date(fromMs), timeZone);
  const month = monthFilterRangeInTimeZone(monthKey, timeZone);
  if (Date.parse(month.from) === fromMs && Date.parse(month.to) === toMs) {
    return { kind: "month", month: month.month };
  }
  return null;
}

export type CalendarCell = {
  date: string;
  day: number;
  inMonth: boolean;
};

function padDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Monday-first grid covering the civil calendar month (IANA zone only affects day keys of padding). */
export function buildCalendarCells(monthKey: string, timeZone: string): CalendarCell[] {
  assertValidTimeZone(timeZone);
  const { year, month } = parseCalendarMonth(monthKey);
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const mondayIndex = (firstWeekday + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: CalendarCell[] = [];

  for (let i = 0; i < mondayIndex; i += 1) {
    const prev = addCalendarDate(year, month, 1, i - mondayIndex);
    cells.push({
      date: padDate(prev.year, prev.month, prev.day),
      day: prev.day,
      inMonth: false,
    });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ date: padDate(year, month, day), day, inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1]!;
    const [y, m, d] = last.date.split("-").map(Number);
    const next = addCalendarDate(y, m, d, 1);
    cells.push({
      date: padDate(next.year, next.month, next.day),
      day: next.day,
      inMonth: false,
    });
  }
  return cells;
}

export const CALENDAR_WEEKDAYS_RU = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"] as const;

export function formatMonthTitleRu(monthKey: string): string {
  const { year, month } = parseCalendarMonth(monthKey);
  const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("ru-RU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function bucketCalendarDaysInTimeZone(
  instants: Date[],
  timeZone: string,
): Array<{ date: string; count: number }> {
  const counts = new Map<string, number>();
  for (const instant of instants) {
    const key = dayKeyFromInstant(instant, timeZone);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));
}

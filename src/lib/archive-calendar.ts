/**
 * P01.3 — desktop calendar helpers (local day/month ranges, grid, selection match).
 * Date field default remains createdAt until product confirms otherwise.
 */

import { monthRangeForOffset, parseCalendarMonth } from "@/lib/reel-archive-query";

const DAY_MS = 86_400_000;

export function clientTzOffsetMinutes(now = new Date()): number {
  return -now.getTimezoneOffset();
}

export function shiftMonthKey(monthKey: string, delta: number): string {
  const { year, month } = parseCalendarMonth(monthKey);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function monthKeyFromDate(date: Date, tzOffsetMinutes: number): string {
  const shifted = new Date(date.getTime() + tzOffsetMinutes * 60_000);
  return shifted.toISOString().slice(0, 7);
}

export function dayKeyFromDate(date: Date, tzOffsetMinutes: number): string {
  const shifted = new Date(date.getTime() + tzOffsetMinutes * 60_000);
  return shifted.toISOString().slice(0, 10);
}

export function dayRangeForOffset(
  dayKey: string,
  tzOffsetMinutes: number,
): { from: string; to: string; day: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey.trim());
  if (!match) {
    throw new Error("День календаря в формате YYYY-MM-DD.");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const fromMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0) - tzOffsetMinutes * 60_000;
  const toMs = fromMs + DAY_MS;
  return {
    day: `${match[1]}-${match[2]}-${match[3]}`,
    from: new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString(),
  };
}

export function monthFilterRangeForOffset(
  monthKey: string,
  tzOffsetMinutes: number,
): { from: string; to: string; month: string } {
  const range = monthRangeForOffset(monthKey, tzOffsetMinutes);
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
  tzOffsetMinutes: number,
): ArchiveDateSelection | null {
  if (!from?.trim() || !to?.trim()) return null;
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;

  const dayKey = dayKeyFromDate(new Date(fromMs), tzOffsetMinutes);
  try {
    const day = dayRangeForOffset(dayKey, tzOffsetMinutes);
    if (Date.parse(day.from) === fromMs && Date.parse(day.to) === toMs) {
      return { kind: "day", day: day.day };
    }
  } catch {
    /* fall through */
  }

  const monthKey = monthKeyFromDate(new Date(fromMs), tzOffsetMinutes);
  const month = monthFilterRangeForOffset(monthKey, tzOffsetMinutes);
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

/** Monday-first grid covering the local calendar month. */
export function buildCalendarCells(monthKey: string, tzOffsetMinutes: number): CalendarCell[] {
  const { year, month } = parseCalendarMonth(monthKey);
  const firstUtc = Date.UTC(year, month - 1, 1) - tzOffsetMinutes * 60_000;
  const first = new Date(firstUtc);
  // weekday in local offset: 0=Sun..6=Sat → Monday-first index
  const shifted = new Date(first.getTime() + tzOffsetMinutes * 60_000);
  const sundayIndex = shifted.getUTCDay();
  const mondayIndex = (sundayIndex + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: CalendarCell[] = [];

  for (let i = 0; i < mondayIndex; i += 1) {
    const dayOffset = i - mondayIndex;
    const instant = new Date(firstUtc + dayOffset * DAY_MS);
    const date = dayKeyFromDate(instant, tzOffsetMinutes);
    cells.push({ date, day: Number(date.slice(8, 10)), inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${monthKey}-${String(day).padStart(2, "0")}`;
    cells.push({ date, day, inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1]!;
    const next = dayRangeForOffset(last.date, tzOffsetMinutes);
    const instant = new Date(Date.parse(next.to));
    const date = dayKeyFromDate(instant, tzOffsetMinutes);
    cells.push({ date, day: Number(date.slice(8, 10)), inMonth: false });
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

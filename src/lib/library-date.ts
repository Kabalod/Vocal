import {
  addCalendarDate,
  dayKeyFromInstant,
  dayRangeInTimeZone,
  formatMonthTitleRu,
  matchArchiveDateSelection,
} from "@/lib/archive-calendar";

/** The date filter of the library as the month calendar shows it (P5). The URL keeps only `from` / `to` (absolute ISO). */
export type LibraryDatePreset = "today" | "yesterday" | "week";
export type LibraryDateKind = "all" | LibraryDatePreset | "month" | "range";
export type LibraryDateFilter = { kind: LibraryDateKind; /** YYYY-MM-DD when kind is "range". */ rangeStart: string; /** YYYY-MM when kind is "month". */ monthValue: string };

const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

function dayParts(dayKey: string) {
  const [year, month, day] = dayKey.split("-").map(Number);
  return { year, month, day };
}

function shiftDay(dayKey: string, delta: number): string {
  const { year, month, day } = dayParts(dayKey);
  const next = addCalendarDate(year, month, day, delta);
  return `${next.year}-${String(next.month).padStart(2, "0")}-${String(next.day).padStart(2, "0")}`;
}

/** Today / yesterday / the last seven days including today, as whole local days. */
export function presetRange(preset: LibraryDatePreset, timeZone: string, now = new Date()): { from: string; to: string } {
  const today = dayKeyFromInstant(now, timeZone);
  if (preset === "today") return pick(dayRangeInTimeZone(today, timeZone));
  if (preset === "yesterday") return pick(dayRangeInTimeZone(shiftDay(today, -1), timeZone));
  const first = dayRangeInTimeZone(shiftDay(today, -6), timeZone);
  const last = dayRangeInTimeZone(today, timeZone);
  return { from: first.from, to: last.to };
}

function pick(range: { from: string; to: string }) {
  return { from: range.from, to: range.to };
}

export function libraryDateFilter(from: string | null, to: string | null, timeZone: string, now = new Date()): LibraryDateFilter {
  if (!from || !to) return { kind: "all", rangeStart: "", monthValue: "" };
  for (const preset of ["today", "yesterday", "week"] as const) {
    const range = presetRange(preset, timeZone, now);
    if (Date.parse(range.from) === Date.parse(from) && Date.parse(range.to) === Date.parse(to)) {
      return { kind: preset, rangeStart: "", monthValue: "" };
    }
  }
  const selection = matchArchiveDateSelection(from, to, timeZone);
  if (selection?.kind === "day") return { kind: "range", rangeStart: selection.day, monthValue: "" };
  if (selection?.kind === "month") return { kind: "month", rangeStart: "", monthValue: selection.month };
  // A custom range from the address bar: the filter is active, the calendar marks nothing.
  return { kind: "range", rangeStart: "", monthValue: "" };
}

/** Text of the chip above the list. */
export function libraryDateLabel(filter: LibraryDateFilter, from: string | null, to: string | null, timeZone: string): string {
  if (filter.kind === "all") return "";
  if (filter.kind === "today") return "Сегодня";
  if (filter.kind === "yesterday") return "Вчера";
  if (filter.kind === "week") return "Неделя";
  if (filter.kind === "month") return formatMonthTitleRu(filter.monthValue).replace(/\s*г\.$/, "");
  if (filter.rangeStart) {
    const { month, day } = dayParts(filter.rangeStart);
    return `${day} ${MONTHS_GEN[month - 1]}`;
  }
  if (from && to) {
    const format = new Intl.DateTimeFormat("ru-RU", { timeZone, day: "numeric", month: "long" });
    return `${format.format(new Date(from))} — ${format.format(new Date(Date.parse(to) - 1))}`;
  }
  return "Даты";
}

export function thoughtsCountLabel(count: number): string {
  const tail = count % 100;
  if (tail >= 11 && tail <= 14) return "мыслей";
  const last = count % 10;
  if (last === 1) return "мысль";
  if (last >= 2 && last <= 4) return "мысли";
  return "мыслей";
}

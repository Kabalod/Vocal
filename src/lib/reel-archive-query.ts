/**
 * P01.1 archive list/calendar query contracts.
 * Calendar date field default is createdAt until the product owner confirms otherwise.
 */

export const ARCHIVE_DATE_FIELD_DEFAULT = "createdAt" as const;
export type ArchiveDateField = "createdAt" | "updatedAt";

export type ArchiveListFilters = {
  status: string;
  sort?: string;
  q?: string | null;
  from?: string | null;
  to?: string | null;
  dateField?: ArchiveDateField | string | null;
};

export type ParsedArchiveRange = {
  from: Date;
  to: Date;
  dateField: ArchiveDateField;
};

export class ArchiveQueryError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ArchiveQueryError";
  }
}

export function resolveArchiveDateField(value?: string | null): ArchiveDateField {
  if (value == null || value === "") {
    return ARCHIVE_DATE_FIELD_DEFAULT;
  }
  if (value === "createdAt" || value === "updatedAt") {
    return value;
  }
  throw new ArchiveQueryError("Поле даты архива: createdAt или updatedAt.", "ARCHIVE_DATE_FIELD");
}

/** Absolute ISO-8601 with Z or numeric offset; no server-local ambiguous times. */
const ABSOLUTE_ISO_INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

export function parseArchiveInstant(raw: string, label: "from" | "to"): Date {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new ArchiveQueryError(`Нужна граница ${label}.`, "ARCHIVE_RANGE");
  }
  if (!ABSOLUTE_ISO_INSTANT.test(trimmed)) {
    throw new ArchiveQueryError(
      `Граница ${label} должна быть абсолютным ISO с Z или offset.`,
      "ARCHIVE_RANGE",
    );
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new ArchiveQueryError(`Некорректная граница ${label}.`, "ARCHIVE_RANGE");
  }
  return date;
}

/** Half-open [from, to). Both bounds required together. */
export function parseArchiveRange(input: {
  from?: string | null;
  to?: string | null;
  dateField?: string | null;
}): ParsedArchiveRange | null {
  const hasFrom = Boolean(input.from?.trim());
  const hasTo = Boolean(input.to?.trim());
  if (!hasFrom && !hasTo) return null;
  if (!hasFrom || !hasTo) {
    throw new ArchiveQueryError("Нужны обе границы диапазона from и to.", "ARCHIVE_RANGE");
  }
  const from = parseArchiveInstant(input.from!, "from");
  const to = parseArchiveInstant(input.to!, "to");
  if (!(from.getTime() < to.getTime())) {
    throw new ArchiveQueryError("Диапазон дат должен быть [from, to) с from < to.", "ARCHIVE_RANGE");
  }
  return {
    from,
    to,
    dateField: resolveArchiveDateField(input.dateField),
  };
}

export type ArchiveListSortId = "newest" | "oldest";

/** Old `updated` / `created` / `title` and unknown values collapse to newest. */
export function normalizeArchiveListSort(value?: string | null): ArchiveListSortId {
  return value === "oldest" ? "oldest" : "newest";
}

export function archiveFilterFingerprint(input: ArchiveListFilters): string {
  const dateField = resolveArchiveDateField(input.dateField);
  return [
    input.status || "open",
    normalizeArchiveListSort(input.sort),
    (input.q ?? "").trim(),
    (input.from ?? "").trim(),
    (input.to ?? "").trim(),
    dateField,
  ].join("\u001f");
}

export function parseCalendarMonth(raw: string): { year: number; month: number; key: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(raw.trim());
  if (!match) {
    throw new ArchiveQueryError("Месяц календаря в формате YYYY-MM.", "CALENDAR_MONTH");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new ArchiveQueryError("Месяц календаря в формате YYYY-MM.", "CALENDAR_MONTH");
  }
  return { year, month, key: `${match[1]}-${match[2]}` };
}

/** Local calendar month → absolute UTC [from, to) using a fixed offset east of UTC. */
export function monthRangeForOffset(
  monthKey: string,
  tzOffsetMinutes: number,
): { from: Date; to: Date; month: string } {
  if (!Number.isInteger(tzOffsetMinutes) || Math.abs(tzOffsetMinutes) > 14 * 60) {
    throw new ArchiveQueryError("Некорректный tzOffsetMinutes.", "CALENDAR_TZ");
  }
  const { year, month, key } = parseCalendarMonth(monthKey);
  const fromMs = Date.UTC(year, month - 1, 1, 0, 0, 0, 0) - tzOffsetMinutes * 60_000;
  const toMs = Date.UTC(year, month, 1, 0, 0, 0, 0) - tzOffsetMinutes * 60_000;
  return { from: new Date(fromMs), to: new Date(toMs), month: key };
}

/** YYYY-MM-DD of the instant in the given fixed offset (minutes east of UTC). */
export function calendarDayKey(instant: Date, tzOffsetMinutes: number): string {
  const shifted = new Date(instant.getTime() + tzOffsetMinutes * 60_000);
  return shifted.toISOString().slice(0, 10);
}

export function bucketCalendarDays(
  instants: Date[],
  tzOffsetMinutes: number,
): Array<{ date: string; count: number }> {
  const counts = new Map<string, number>();
  for (const instant of instants) {
    const key = calendarDayKey(instant, tzOffsetMinutes);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));
}

export type CalendarFacetDto = {
  month: string;
  dateField: ArchiveDateField;
  /** Documented default until product confirms updatedAt. */
  dateFieldDefault: typeof ARCHIVE_DATE_FIELD_DEFAULT;
  tzOffsetMinutes: number;
  from: string;
  to: string;
  days: Array<{ date: string; count: number }>;
  dataBounds: { earliest: string | null; latest: string | null };
  matchCount: number;
};

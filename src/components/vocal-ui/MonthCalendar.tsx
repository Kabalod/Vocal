"use client";

const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const WEEK = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export type DatePreset = "today" | "yesterday" | "week";
export type DateFilterKind = "all" | DatePreset | "month" | "range";

export const isoDay = (year: number, month: number, day: number) =>
  `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/** Monday-first offset of the 1st and the number of days (UTC arithmetic: no time-zone drift). */
export function monthGrid(year: number, month: number): { offset: number; days: number } {
  return {
    offset: (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7,
    days: new Date(Date.UTC(year, month + 1, 0)).getUTCDate(),
  };
}

export function dateFilterLabel(filter: DateFilterKind, rangeStart: string, monthValue: string): string {
  if (filter === "today") return "Сегодня";
  if (filter === "yesterday") return "Вчера";
  if (filter === "week") return "Неделя";
  if (filter === "month" && monthValue) {
    const [y, m] = monthValue.split("-").map(Number);
    return `${MONTHS[m - 1]} ${y}`;
  }
  if (filter === "range" && rangeStart) {
    const [, m, d] = rangeStart.split("-").map(Number);
    return `${d} ${MONTHS_GEN[m - 1]}`;
  }
  return "";
}

const PRESETS: readonly [DatePreset, string][] = [
  ["today", "Сегодня"],
  ["yesterday", "Вчера"],
  ["week", "Неделя"],
];

/**
 * Month calendar (controlled): 7 columns Monday-first, presets, "Весь месяц", reset, dots on days with thoughts, today ring,
 * selected day / selected month. The same markup serves a sidebar and a sheet. Buttons are real buttons with aria-pressed and
 * a full date in the accessible name.
 */
export function MonthCalendar({
  year,
  month,
  onMonthChange,
  marked,
  today,
  dateFilter,
  rangeStart,
  monthValue,
  onPreset,
  onDay,
  onWholeMonth,
  onReset,
}: {
  year: number;
  /** 0-based. */
  month: number;
  onMonthChange: (year: number, month: number) => void;
  /** ISO days (YYYY-MM-DD) that have thoughts. */
  marked: ReadonlySet<string>;
  /** ISO day of today. */
  today: string;
  dateFilter: DateFilterKind;
  rangeStart: string;
  /** YYYY-MM when `dateFilter` is "month". */
  monthValue: string;
  onPreset: (preset: DatePreset) => void;
  onDay: (iso: string) => void;
  onWholeMonth: () => void;
  onReset: () => void;
}) {
  const { offset, days } = monthGrid(year, month);
  const thisMonth = isoDay(year, month, 1).slice(0, 7);
  const monthSelected = dateFilter === "month" && monthValue === thisMonth;
  const shift = (delta: number) => {
    const next = new Date(Date.UTC(year, month + delta, 1));
    onMonthChange(next.getUTCFullYear(), next.getUTCMonth());
  };
  const chip = (selected: boolean) =>
    `relative inline-flex h-7 items-center rounded-full border-[0.5px] px-2.5 text-xs font-medium after:absolute after:-inset-2 after:content-[''] ${
      selected ? "border-transparent bg-accent text-on-accent" : "border-line-strong bg-white/[0.03] text-text-soft hover:bg-white/[0.07]"
    }`;
  const nav =
    "relative inline-flex h-8 w-8 items-center justify-center rounded-lg text-accent-soft hover:bg-white/5 after:absolute after:-inset-1.5 after:content-['']";

  return (
    <div className="flex flex-col gap-2.5 text-text" data-month-calendar>
      <div className="grid grid-cols-[32px_1fr_32px] items-center">
        <button type="button" aria-label="Предыдущий месяц" className={nav} onClick={() => shift(-1)}>
          <span aria-hidden="true">‹</span>
        </button>
        <strong className="text-center text-sm font-semibold" aria-live="polite">
          {MONTHS[month]} {year}
        </strong>
        <button type="button" aria-label="Следующий месяц" className={nav} onClick={() => shift(1)}>
          <span aria-hidden="true">›</span>
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map(([value, label]) => (
          <button type="button" key={value} aria-pressed={dateFilter === value} className={chip(dateFilter === value)} onClick={() => onPreset(value)}>
            {label}
          </button>
        ))}
        <button type="button" aria-pressed={monthSelected} className={chip(monthSelected)} onClick={onWholeMonth}>
          Весь месяц
        </button>
        {dateFilter !== "all" ? (
          <button type="button" className="relative ml-auto px-0.5 text-xs text-accent-soft hover:underline after:absolute after:-inset-2 after:content-['']" onClick={onReset}>
            Сбросить
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-7 gap-0.5" aria-hidden="true">
        {WEEK.map((day) => (
          <span key={day} className="text-center text-[11px] leading-5 text-muted">
            {day}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: offset }, (_, index) => (
          <span key={`blank-${index}`} aria-hidden="true" />
        ))}
        {Array.from({ length: days }, (_, index) => {
          const day = index + 1;
          const value = isoDay(year, month, day);
          const selected = dateFilter === "range" && rangeStart === value;
          const hasThought = marked.has(value);
          const isToday = value === today;
          return (
            <button
              type="button"
              key={value}
              data-day={value}
              data-today={isToday || undefined}
              data-has-thought={hasThought || undefined}
              aria-pressed={selected}
              aria-label={`${day} ${MONTHS_GEN[month]}${isToday ? ", сегодня" : ""}${hasThought ? ", есть мысли" : ""}`}
              onClick={() => onDay(value)}
              className={`relative mx-auto grid aspect-square w-full max-w-[34px] place-items-center rounded-full pb-1.5 text-xs font-medium tabular-nums hover:bg-white/10 ${
                selected ? "bg-accent text-on-accent" : monthSelected ? "bg-accent/[0.13] text-text" : "text-text-soft"
              } ${isToday && !selected ? "shadow-[inset_0_0_0_1.5px_var(--accent)]" : ""}`}
            >
              {day}
              {hasThought ? (
                <span aria-hidden="true" className={`absolute bottom-1 left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full ${selected ? "bg-white" : "bg-accent-soft"}`} />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

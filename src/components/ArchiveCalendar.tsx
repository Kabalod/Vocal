"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  CALENDAR_WEEKDAYS_RU,
  buildCalendarCells,
  clientTzOffsetMinutes,
  dayKeyFromDate,
  dayRangeForOffset,
  formatMonthTitleRu,
  matchArchiveDateSelection,
  monthFilterRangeForOffset,
  monthKeyFromDate,
  shiftMonthKey,
} from "@/lib/archive-calendar";
import type { CalendarFacetDto } from "@/lib/reel-archive-query";
import type { ArchiveListUrlState } from "@/lib/thought-archive-state";

type Props = {
  state: Pick<ArchiveListUrlState, "q" | "status" | "from" | "to" | "dateField">;
  onApplyRange: (range: { from: string; to: string }) => void;
  onClearDate: () => void;
};

export function ArchiveCalendar({ state, onApplyRange, onClearDate }: Props) {
  const labelId = useId();
  const tz = useMemo(() => clientTzOffsetMinutes(), []);
  const today = useMemo(() => dayKeyFromDate(new Date(), tz), [tz]);
  const selection = useMemo(
    () => matchArchiveDateSelection(state.from, state.to, tz),
    [state.from, state.to, tz],
  );

  const initialMonth =
    selection?.kind === "day"
      ? selection.day.slice(0, 7)
      : selection?.kind === "month"
        ? selection.month
        : monthKeyFromDate(new Date(), tz);

  const [viewMonth, setViewMonth] = useState(initialMonth);
  const [facets, setFacets] = useState<CalendarFacetDto | null>(null);
  const [facetsError, setFacetsError] = useState<string | null>(null);
  const [loadingFacets, setLoadingFacets] = useState(false);

  useEffect(() => {
    if (selection?.kind === "day") setViewMonth(selection.day.slice(0, 7));
    else if (selection?.kind === "month") setViewMonth(selection.month);
  }, [selection]);

  useEffect(() => {
    const ac = new AbortController();
    const params = new URLSearchParams();
    params.set("month", viewMonth);
    params.set("tzOffsetMinutes", String(tz));
    params.set("status", state.status);
    if (state.q.trim()) params.set("q", state.q.trim());
    if (state.dateField === "updatedAt") params.set("dateField", "updatedAt");

    setLoadingFacets(true);
    setFacetsError(null);
    void fetch(`/api/reels/calendar?${params}`, { cache: "no-store", signal: ac.signal })
      .then(async (res) => {
        const data = (await res.json()) as CalendarFacetDto & { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить календарь.");
        setFacets(data);
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        setFacets(null);
        setFacetsError(err instanceof Error ? err.message : "Ошибка календаря.");
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoadingFacets(false);
      });

    return () => ac.abort();
  }, [state.dateField, state.q, state.status, tz, viewMonth]);

  const marked = useMemo(() => {
    const map = new Map<string, number>();
    for (const day of facets?.days ?? []) map.set(day.date, day.count);
    return map;
  }, [facets]);

  const cells = useMemo(() => buildCalendarCells(viewMonth, tz), [tz, viewMonth]);
  const monthSelected = selection?.kind === "month" && selection.month === viewMonth;
  const hasDateFilter = Boolean(state.from && state.to);

  return (
    <section className="hidden space-y-3 shell:block" aria-labelledby={labelId}>
      <div className="flex items-center justify-between gap-2">
        <h2 id={labelId} className="text-sm font-medium text-text">
          {formatMonthTitleRu(viewMonth)}
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control border border-line text-muted hover:text-text"
            aria-label="Предыдущий месяц"
            onClick={() => setViewMonth((m) => shiftMonthKey(m, -1))}
          >
            ‹
          </button>
          <button
            type="button"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control border border-line text-muted hover:text-text"
            aria-label="Следующий месяц"
            onClick={() => setViewMonth((m) => shiftMonthKey(m, 1))}
          >
            ›
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted" aria-hidden="true">
        {CALENDAR_WEEKDAYS_RU.map((day) => (
          <span key={day} className="py-1">
            {day}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Календарь мыслей">
        {cells.map((cell) => {
          const count = marked.get(cell.date) ?? 0;
          const isToday = cell.date === today;
          const isSelected = selection?.kind === "day" && selection.day === cell.date;
          const hasResults = cell.inMonth && count > 0;
          const label = [
            cell.date,
            isToday ? "сегодня" : null,
            hasResults ? `${count} мыслей` : "нет мыслей",
            isSelected ? "выбран" : null,
          ]
            .filter(Boolean)
            .join(", ");

          return (
            <button
              key={`${cell.date}-${cell.inMonth ? "in" : "out"}`}
              type="button"
              role="gridcell"
              disabled={!cell.inMonth}
              aria-label={label}
              aria-current={isToday ? "date" : undefined}
              aria-selected={isSelected}
              onClick={() => {
                const range = dayRangeForOffset(cell.date, tz);
                onApplyRange({ from: range.from, to: range.to });
              }}
              className={[
                "relative flex min-h-11 min-w-0 flex-col items-center justify-center rounded-control text-sm",
                cell.inMonth ? "text-text" : "text-muted/40",
                isSelected ? "bg-accent text-on-accent" : "hover:bg-accent-dim",
                !isSelected && isToday ? "ring-1 ring-accent-soft" : "",
                !cell.inMonth ? "pointer-events-none" : "",
              ].join(" ")}
            >
              <span>{cell.day}</span>
              {hasResults && !isSelected ? (
                <span className="absolute bottom-1 h-1 w-1 rounded-full bg-accent" aria-hidden="true" />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          className={`min-h-11 rounded-full border px-3 text-sm ${
            monthSelected
              ? "border-accent bg-accent/15 text-text"
              : "border-line bg-surface text-muted hover:text-text"
          }`}
          aria-pressed={monthSelected}
          onClick={() => {
            const range = monthFilterRangeForOffset(viewMonth, tz);
            onApplyRange({ from: range.from, to: range.to });
          }}
        >
          Показать месяц
        </button>
        {hasDateFilter ? (
          <button
            type="button"
            className="min-h-11 text-sm text-muted underline-offset-2 hover:text-text hover:underline"
            onClick={onClearDate}
          >
            Сбросить дату
          </button>
        ) : null}
        {loadingFacets ? (
          <p className="text-xs text-muted" role="status">
            Обновление меток…
          </p>
        ) : null}
        {facetsError ? (
          <p className="text-xs text-bad" role="alert">
            {facetsError}
          </p>
        ) : null}
      </div>
    </section>
  );
}

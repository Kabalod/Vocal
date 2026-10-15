"use client";

import { useEffect, useMemo, useState } from "react";
import { MonthCalendar } from "@/components/vocal-ui/MonthCalendar";
import {
  dayKeyFromInstant,
  dayRangeInTimeZone,
  monthFilterRangeInTimeZone,
  monthKeyFromInstant,
  resolveClientTimeZone,
} from "@/lib/archive-calendar";
import { libraryDateFilter, presetRange } from "@/lib/library-date";
import type { CalendarFacetDto } from "@/lib/reel-archive-query";
import type { ArchiveListUrlState } from "@/lib/thought-archive-state";

type Props = {
  state: Pick<ArchiveListUrlState, "q" | "status" | "from" | "to" | "dateField">;
  onApplyRange: (range: { from: string; to: string }) => void;
  onClearDate: () => void;
};

/**
 * Month calendar of the library (P5): the P2 `MonthCalendar` over the existing facets endpoint. Dots come from
 * `/api/reels/calendar` for the viewed month under the same search / status filters as the list; presets, a day and the whole
 * month become the same `from` / `to` range the list API already takes.
 */
export function ArchiveCalendar({ state, onApplyRange, onClearDate }: Props) {
  const timeZone = useMemo(() => resolveClientTimeZone(), []);
  const today = useMemo(() => dayKeyFromInstant(new Date(), timeZone), [timeZone]);
  const filter = useMemo(() => libraryDateFilter(state.from, state.to, timeZone), [state.from, state.to, timeZone]);

  const [viewMonth, setViewMonth] = useState(() => {
    if (filter.kind === "range" && filter.rangeStart) return filter.rangeStart.slice(0, 7);
    if (filter.kind === "month") return filter.monthValue;
    return monthKeyFromInstant(new Date(), timeZone);
  });
  const [facets, setFacets] = useState<CalendarFacetDto | null>(null);

  useEffect(() => {
    if (filter.kind === "range" && filter.rangeStart) setViewMonth(filter.rangeStart.slice(0, 7));
    else if (filter.kind === "month") setViewMonth(filter.monthValue);
  }, [filter.kind, filter.rangeStart, filter.monthValue]);

  useEffect(() => {
    const ac = new AbortController();
    const params = new URLSearchParams();
    params.set("month", viewMonth);
    params.set("timeZone", timeZone);
    params.set("status", state.status);
    if (state.q.trim()) params.set("q", state.q.trim());
    if (state.dateField === "updatedAt") params.set("dateField", "updatedAt");
    void fetch(`/api/reels/calendar?${params}`, { cache: "no-store", signal: ac.signal })
      .then(async (res) => {
        const data = (await res.json()) as CalendarFacetDto;
        if (!res.ok) throw new Error("calendar");
        setFacets(data);
      })
      .catch(() => {
        if (!ac.signal.aborted) setFacets(null);
      });
    return () => ac.abort();
  }, [state.dateField, state.q, state.status, timeZone, viewMonth]);

  const marked = useMemo(() => new Set((facets?.days ?? []).filter((day) => day.count > 0).map((day) => day.date)), [facets]);
  const [year, month] = viewMonth.split("-").map(Number);

  return (
    <MonthCalendar
      year={year}
      month={month - 1}
      onMonthChange={(nextYear, nextMonth) => setViewMonth(`${nextYear}-${String(nextMonth + 1).padStart(2, "0")}`)}
      marked={marked}
      today={today}
      dateFilter={filter.kind}
      rangeStart={filter.rangeStart}
      monthValue={filter.monthValue}
      onPreset={(preset) => onApplyRange(presetRange(preset, timeZone))}
      onDay={(day) => {
        const range = dayRangeInTimeZone(day, timeZone);
        onApplyRange({ from: range.from, to: range.to });
      }}
      onWholeMonth={() => {
        const range = monthFilterRangeInTimeZone(viewMonth, timeZone);
        onApplyRange({ from: range.from, to: range.to });
      }}
      onReset={onClearDate}
    />
  );
}

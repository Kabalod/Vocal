"use client";

import { useEffect, useState } from "react";
import {
  dayKeyFromInstant,
  formatArchiveDateHeading,
  matchArchiveDateSelection,
  resolveClientTimeZone,
} from "@/lib/archive-calendar";

export function ArchiveDateControl({
  from,
  to,
  open,
  onOpen,
}: {
  from: string | null;
  to: string | null;
  open: boolean;
  onOpen: () => void;
}) {
  const [view, setView] = useState({
    title: "Календарь",
    subtitle: "День или месяц",
    showToday: true,
  });

  useEffect(() => {
    const timeZone = resolveClientTimeZone();
    const heading = formatArchiveDateHeading(from, to, timeZone);
    const selection = matchArchiveDateSelection(from, to, timeZone);
    const today = dayKeyFromInstant(new Date(), timeZone);
    setView({
      title: heading.title,
      subtitle: heading.subtitle,
      showToday: !selection || (selection.kind === "day" && selection.day === today),
    });
  }, [from, to]);

  return (
    <button
      type="button"
      className="archive-date-control min-h-11 w-full rounded-control px-2 py-2 text-left hover:bg-field"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label="Открыть календарь"
      onClick={onOpen}
    >
      {view.showToday ? <span className="archive-date-eyebrow block text-xs text-muted">Сегодня</span> : null}
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="archive-date-title block font-[family-name:var(--font-display)] text-xl leading-tight text-text">
            {view.title}
          </span>
          <span className="archive-date-subtitle block text-sm capitalize text-muted">{view.subtitle}</span>
        </span>
        <span aria-hidden className="archive-date-chevron mt-1 text-muted">
          ▾
        </span>
      </span>
    </button>
  );
}

"use client";

import {
  IconStatusAll,
  IconStatusDone,
  IconStatusOpen,
  IconStatusProgress,
} from "@/components/vocal-ui/icons";
import { RECORDING_FILTERS, type RecordingFilterId } from "@/components/reel-filters";

const ICONS = {
  all: IconStatusAll,
  idea: IconStatusOpen,
  in_progress: IconStatusProgress,
  completed: IconStatusDone,
} as const;

export function ArchiveStatusFilters({
  value,
  onChange,
  variant = "sidebar",
}: {
  value: RecordingFilterId;
  onChange: (id: RecordingFilterId) => void;
  variant?: "sidebar" | "chips" | "sheet";
}) {
  if (variant === "chips") {
    return (
      <div className="archive-status-chips" role="group" aria-label="Фильтры мыслей">
        {RECORDING_FILTERS.map((item) => {
          const Icon = ICONS[item.id];
          const active = value === item.id;
          return (
            <button key={item.id} type="button" aria-pressed={active} onClick={() => onChange(item.id)} data-active={active || undefined}>
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-2" role="group" aria-label="Фильтры мыслей">
      {variant === "sidebar" ? <p className="px-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Статус</p> : null}
      <ul className="space-y-1">
        {RECORDING_FILTERS.map((item) => {
          const Icon = ICONS[item.id];
          const active = value === item.id;
          return (
            <li key={item.id}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onChange(item.id)}
                className={`flex min-h-11 w-full items-center gap-2 rounded-control px-2 text-left text-sm ${
                  active ? "bg-accent/12 text-accent-soft" : "text-muted hover:bg-accent-dim hover:text-text"
                }`}
              >
                <Icon className={`h-5 w-5 shrink-0 ${active ? "text-accent-soft" : "text-muted"}`} />
                <span className="archive-status-label">{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

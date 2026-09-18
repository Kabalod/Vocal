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
}: {
  value: RecordingFilterId;
  onChange: (id: RecordingFilterId) => void;
}) {
  return (
    <div className="space-y-2" role="group" aria-label="Фильтры мыслей">
      <p className="text-xs uppercase tracking-[0.14em] text-muted">Статус</p>
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
                className={`flex min-h-11 w-full items-center gap-3 rounded-control px-2 text-left text-sm ${
                  active ? "bg-accent/15 text-accent-soft" : "text-muted hover:bg-accent-dim hover:text-text"
                }`}
              >
                <Icon className={active ? "text-accent-soft" : "text-muted"} />
                <span>{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

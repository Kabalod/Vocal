"use client";

import type { ArchiveDensity } from "@/lib/archive-density";

function IconGrid3() {
  return (
    <svg aria-hidden className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
      <rect x="4" y="5" width="4.5" height="14" rx="1" />
      <rect x="9.75" y="5" width="4.5" height="14" rx="1" />
      <rect x="15.5" y="5" width="4.5" height="14" rx="1" />
    </svg>
  );
}

function IconGrid4() {
  return (
    <svg aria-hidden className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
      <rect x="3.5" y="5" width="3.4" height="14" rx="0.8" />
      <rect x="8" y="5" width="3.4" height="14" rx="0.8" />
      <rect x="12.6" y="5" width="3.4" height="14" rx="0.8" />
      <rect x="17.1" y="5" width="3.4" height="14" rx="0.8" />
    </svg>
  );
}

export function ArchiveDensityToggle({
  value,
  onChange,
}: {
  value: ArchiveDensity;
  onChange: (value: ArchiveDensity) => void;
}) {
  return (
    <div className="hidden items-center gap-1 shell:inline-flex" role="group" aria-label="Плотность сетки">
      <button
        type="button"
        className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-control ${
          value === "large" ? "bg-bg text-text" : "text-muted hover:text-text"
        }`}
        aria-pressed={value === "large"}
        aria-label="Крупная сетка, 3 карточки"
        onClick={() => onChange("large")}
      >
        <IconGrid3 />
      </button>
      <button
        type="button"
        className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-control ${
          value === "compact" ? "bg-bg text-text" : "text-muted hover:text-text"
        }`}
        aria-pressed={value === "compact"}
        aria-label="Компактная сетка, 4 карточки"
        onClick={() => onChange("compact")}
      >
        <IconGrid4 />
      </button>
    </div>
  );
}

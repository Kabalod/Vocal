"use client";

import type { ArchiveDensity } from "@/lib/archive-density";

function IconSpatial() {
  return (
    <svg aria-hidden className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
      <rect x="3.5" y="4.5" width="8" height="9" rx="1.2" transform="rotate(-4 7.5 9)" />
      <rect x="12.5" y="5.5" width="8" height="8" rx="1.2" transform="rotate(5 16.5 9.5)" />
      <rect x="7" y="13" width="10" height="7" rx="1.2" transform="rotate(-2 12 16.5)" />
    </svg>
  );
}

function IconCompact() {
  return (
    <svg aria-hidden className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
      <rect x="3.5" y="5" width="3.4" height="14" rx="0.8" />
      <rect x="8" y="5" width="3.4" height="14" rx="0.8" />
      <rect x="12.6" y="5" width="3.4" height="14" rx="0.8" />
      <rect x="17.1" y="5" width="3.4" height="14" rx="0.8" />
    </svg>
  );
}

function IconList() {
  return (
    <svg aria-hidden className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
      <path d="M5 7h14M5 12h14M5 17h14" />
    </svg>
  );
}

const OPTIONS: Array<{ id: ArchiveDensity; label: string; Icon: typeof IconSpatial }> = [
  { id: "large", label: "Пространственный вид", Icon: IconSpatial },
  { id: "compact", label: "Компактный вид", Icon: IconCompact },
  { id: "list", label: "Список", Icon: IconList },
];

export function ArchiveDensityToggle({
  value,
  onChange,
}: {
  value: ArchiveDensity;
  onChange: (value: ArchiveDensity) => void;
}) {
  return (
    <div className="archive-toolbar-segment hidden items-center gap-0.5 shell:inline-flex" role="group" aria-label="Вид архива">
      {OPTIONS.map((item) => {
        const Icon = item.Icon;
        const active = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            className={`inline-flex h-11 min-h-11 min-w-11 items-center justify-center rounded-[var(--vocal-radius-control)] ${
              active ? "bg-bg text-text" : "text-muted hover:text-text"
            }`}
            aria-pressed={active}
            aria-label={item.label}
            onClick={() => onChange(item.id)}
          >
            <Icon />
          </button>
        );
      })}
    </div>
  );
}

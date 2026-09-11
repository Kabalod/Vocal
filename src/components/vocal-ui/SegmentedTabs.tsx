"use client";

import { useRef } from "react";
import { nextTabIndex } from "@/components/vocal-ui/segmented-tabs";

export function SegmentedTabs({
  items,
  value,
  onChange,
  "aria-label": ariaLabel = "Вкладки",
}: {
  items: readonly { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  "aria-label"?: string;
}) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(
    0,
    items.findIndex((item) => item.id === value),
  );

  function moveTo(index: number) {
    const item = items[index];
    if (!item) return;
    onChange(item.id);
    tabRefs.current[index]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex min-h-11 rounded-[var(--vocal-radius-control)] bg-bg p-1"
      onKeyDown={(event) => {
        const next = nextTabIndex(selectedIndex, items.length, event.key);
        if (next == null) return;
        event.preventDefault();
        moveTo(next);
      }}
    >
      {items.map((item, index) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            className={`min-h-11 min-w-0 flex-1 rounded-[8px] px-3 text-sm ${
              selected ? "border border-line bg-field text-text" : "border border-transparent text-muted hover:text-text"
            }`}
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

"use client";

import { useRef, type ReactNode } from "react";
import { nextTabIndex } from "@/components/vocal-ui/segmented-tabs";

export type SegmentedTabItem = {
  id: string;
  label: string;
  /** Icon of the icon-only variant. */
  icon?: ReactNode;
  /** Tooltip of the icon-only variant (defaults to the label). */
  hint?: string;
};

/**
 * `text`: the labels. `icon`: icon-only tabs 36×28 with a tooltip (`title`) and an accessible name (`aria-label`);
 * the 28 px height is the look, the touch target is extended to 44 px by the pseudo-element. Same roles and keys in both.
 */
export function SegmentedTabs({
  items,
  value,
  onChange,
  variant = "text",
  "aria-label": ariaLabel = "Вкладки",
}: {
  items: readonly SegmentedTabItem[];
  value: string;
  onChange: (id: string) => void;
  variant?: "text" | "icon";
  "aria-label"?: string;
}) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(
    0,
    items.findIndex((item) => item.id === value),
  );
  const icon = variant === "icon";

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
      data-variant={variant}
      className={
        icon
          ? "inline-flex w-fit min-w-0 gap-0.5 rounded-[9px] bg-white/[0.06] p-0.5"
          : "flex min-h-11 min-w-0 flex-wrap rounded-[var(--vocal-radius-control)] bg-bg p-1"
      }
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
            aria-label={icon ? item.label : undefined}
            title={icon ? (item.hint ?? item.label) : undefined}
            tabIndex={selected ? 0 : -1}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            className={
              icon
                ? `relative inline-flex h-7 w-9 items-center justify-center rounded-[7px] border-0 after:absolute after:-inset-1.5 after:content-[''] ${
                    selected ? "bg-white/[0.12] text-text shadow-[0_2px_5px_rgba(0,0,0,0.27)]" : "text-muted hover:text-text"
                  }`
                : `min-h-11 min-w-0 flex-1 rounded-[8px] px-3 text-sm ${
                    selected ? "border border-line bg-field text-text" : "border border-transparent text-muted hover:text-text"
                  }`
            }
            onClick={() => onChange(item.id)}
          >
            {icon ? <span aria-hidden="true" className="inline-flex h-4 w-4 items-center justify-center">{item.icon}</span> : item.label}
          </button>
        );
      })}
    </div>
  );
}

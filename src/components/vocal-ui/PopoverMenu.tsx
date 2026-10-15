"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { nextMenuIndex } from "@/components/vocal-ui/popover-menu";

export type PopoverMenuItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
};

/**
 * Desktop menu anchored to its trigger (macOS style: 10 px radius, shadow). Esc and a click outside close it,
 * arrows move, Enter/Space pick. Touch widths use ActionSheet instead.
 */
export function PopoverMenu({
  trigger,
  items,
  onSelect,
  align = "right",
}: {
  trigger: (props: {
    ref: React.RefObject<HTMLButtonElement | null>;
    onClick: () => void;
    "aria-haspopup": "menu";
    "aria-expanded": boolean;
    "aria-controls": string | undefined;
  }) => ReactNode;
  items: readonly PopoverMenuItem[];
  onSelect: (id: string) => void;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();
  const disabled = items.map((item) => Boolean(item.disabled));

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const first = disabled.findIndex((d) => !d);
    itemRefs.current[first]?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    const current = itemRefs.current.findIndex((el) => el === document.activeElement);
    const next = nextMenuIndex(current, event.key, disabled);
    if (next !== null) {
      event.preventDefault();
      itemRefs.current[next]?.focus();
    }
  };

  return (
    <div ref={rootRef} className="relative">
      {trigger({
        ref: triggerRef,
        onClick: () => setOpen((value) => !value),
        "aria-haspopup": "menu",
        "aria-expanded": open,
        "aria-controls": open ? menuId : undefined,
      })}
      {open ? (
        <div
          id={menuId}
          role="menu"
          onKeyDown={onKeyDown}
          className={`absolute top-full z-30 mt-1.5 min-w-[220px] overflow-hidden rounded-[10px] border border-line bg-bg-elev p-1 shadow-[0_12px_32px_rgba(0,0,0,0.45)] ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {items.map((item, index) => (
            <button
              key={item.id}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                close(false);
                onSelect(item.id);
              }}
              className={`flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-[13px] hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none disabled:opacity-40 ${
                item.destructive ? "text-bad" : "text-text"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

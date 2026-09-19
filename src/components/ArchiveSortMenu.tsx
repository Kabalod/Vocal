"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ARCHIVE_LIST_SORTS, type ArchiveListSort } from "@/lib/thought-archive-state";

function IconSort() {
  return (
    <svg aria-hidden className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
      <path d="M7 7h10M9 12h6M11 17h2" />
    </svg>
  );
}

const SORT_LABELS: Record<ArchiveListSort, string> = {
  newest: "Новые сначала",
  oldest: "Старые сначала",
};

export function ArchiveSortMenu({
  value,
  onChange,
}: {
  value: ArchiveListSort;
  onChange: (id: ArchiveListSort) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const labelId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="archive-sort-wrap">
      <button
        ref={buttonRef}
        type="button"
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--vocal-radius-control)] border border-line bg-surface"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Сортировка"
        onClick={() => setOpen((current) => !current)}
      >
        <IconSort />
      </button>
      {open ? (
        <div className="archive-sort-popover mt-1" role="listbox" aria-labelledby={labelId}>
          <p id={labelId} className="sr-only">
            Сортировка списка
          </p>
          {ARCHIVE_LIST_SORTS.map((item) => {
            const selected = value === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(item.id);
                  setOpen(false);
                  buttonRef.current?.focus();
                }}
              >
                <span>{SORT_LABELS[item.id]}</span>
                {selected ? <span aria-hidden="true">✓</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

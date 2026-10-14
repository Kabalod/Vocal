"use client";

import { useId, useRef, type ReactNode } from "react";
import { useDialogBehavior } from "@/components/vocal-ui/dialog-behavior";

/**
 * Bottom sheet (iOS): a panel at the bottom edge at every width, a grabber, rounded top corners, safe-area padding, a backdrop that
 * closes on click. Escape closes; focus is trapped and returned to the trigger (dialog-behavior.ts). `title` is the accessible name
 * (shown when `showTitle`).
 */
export function Sheet({
  open,
  onClose,
  title,
  showTitle = true,
  children,
  initialFocus = "first",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  showTitle?: boolean;
  children: ReactNode;
  initialFocus?: "first" | "safe";
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogBehavior({ open, panelRef, onClose, initialFocus });
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="vocal-overlay-panel relative max-h-[70dvh] min-h-[180px] w-full max-w-xl overflow-auto overscroll-contain rounded-t-[18px] bg-bg-elev px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2"
      >
        <span aria-hidden="true" className="mx-auto mb-3 block h-1 w-9 rounded-full bg-line-strong" />
        <h2 id={titleId} className={showTitle ? "mb-3 font-[family-name:var(--font-display)] text-lg" : "sr-only"}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

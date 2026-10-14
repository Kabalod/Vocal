"use client";

import { useId, useRef } from "react";
import { useDialogBehavior } from "@/components/vocal-ui/dialog-behavior";

export type ActionSheetAction = {
  id: string;
  label: string;
  /** Red text: deletes or discards something. */
  destructive?: boolean;
  disabled?: boolean;
};

/**
 * iOS action sheet: a group of actions, a separate "Отмена" below. An action closes the sheet first and then reports its id.
 * Escape and the backdrop cancel. The first enabled action takes focus.
 */
export function ActionSheet({
  open,
  title,
  message,
  actions,
  onSelect,
  onClose,
  cancelLabel = "Отмена",
}: {
  open: boolean;
  title?: string;
  message?: string;
  actions: readonly ActionSheetAction[];
  onSelect: (id: string) => void;
  onClose: () => void;
  cancelLabel?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogBehavior({ open, panelRef, onClose });
  if (!open) return null;
  const row = "flex min-h-[52px] w-full items-center justify-center px-4 text-base disabled:opacity-40";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className="absolute inset-0 bg-black/50" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title ? undefined : "Действия"}
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className="relative w-full max-w-md space-y-2"
      >
        <div className="vocal-overlay-panel overflow-hidden rounded-[14px] bg-bg-elev">
          {title || message ? (
            <div className="border-b border-line px-4 py-3 text-center">
              {title ? (
                <p id={titleId} className="text-sm font-medium text-text">
                  {title}
                </p>
              ) : null}
              {message ? <p className="mt-0.5 text-xs text-muted">{message}</p> : null}
            </div>
          ) : null}
          <ul className="divide-y divide-line">
            {actions.map((action) => (
              <li key={action.id}>
                <button
                  type="button"
                  disabled={action.disabled}
                  className={`${row} ${action.destructive ? "text-bad" : "text-accent-soft"} hover:bg-white/5`}
                  onClick={() => {
                    onClose();
                    onSelect(action.id);
                  }}
                >
                  {action.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <button type="button" className={`${row} vocal-overlay-panel rounded-[14px] bg-bg-elev font-medium text-text hover:bg-white/5`} onClick={onClose}>
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}

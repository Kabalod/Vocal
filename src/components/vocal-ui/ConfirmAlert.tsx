"use client";

import { useId, useRef, type ReactNode } from "react";
import { useDialogBehavior } from "@/components/vocal-ui/dialog-behavior";

/**
 * iOS alert: a short centered box, title, one sentence, two buttons side by side. The safe answer ("Отмена") takes the initial
 * focus; Escape and the backdrop cancel; nothing but the confirm button confirms. role="alertdialog".
 */
export function ConfirmAlert({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = "Отмена",
  destructive = false,
  confirmDisabled = false,
  children,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** The confirm button stays inactive (a typed confirmation below the message, passed as `children`). */
  confirmDisabled?: boolean;
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const messageId = useId();
  useDialogBehavior({ open, panelRef, onClose: onCancel, initialFocus: "safe" });
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/50" aria-hidden="true" onClick={onCancel} />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
        tabIndex={-1}
        className="vocal-overlay-panel relative w-full max-w-[280px] overflow-hidden rounded-[14px] bg-bg-elev text-center"
      >
        <div className="px-4 pb-4 pt-5">
          <h2 id={titleId} className="text-base font-semibold text-text">
            {title}
          </h2>
          {message ? (
            <p id={messageId} className="mt-1 text-sm text-muted">
              {message}
            </p>
          ) : null}
          {children ? <div className="mt-3 text-left">{children}</div> : null}
        </div>
        <div className="grid grid-cols-2 divide-x divide-line border-t border-line">
          <button type="button" data-vocal-initial="safe" className="min-h-11 text-base text-accent-soft hover:bg-white/5" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={confirmDisabled}
            className={`min-h-11 text-base font-medium hover:bg-white/5 disabled:opacity-40 disabled:hover:bg-transparent ${destructive ? "text-bad" : "text-accent-soft"}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useId, useRef, type ReactNode } from "react";
import { useDialogBehavior } from "@/components/vocal-ui/dialog-behavior";
import { ActionButton } from "@/components/vocal-ui/ActionButton";
import { IconButton } from "@/components/vocal-ui/IconButton";
import { IconClose } from "@/components/vocal-ui/icons";

/**
 * Desktop: a centered dialog. Mobile (below the shell breakpoint): a bottom sheet with a grabber, safe-area padding, backdrop click
 * and Escape to close, focus kept inside (see dialog-behavior.ts). `placement="sheet"` only widens the desktop panel.
 */
export function VocalModal({
  open,
  title,
  onClose,
  children,
  placement = "dialog",
  initialFocus = "first",
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  placement?: "dialog" | "sheet";
  initialFocus?: "first" | "safe";
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogBehavior({ open, panelRef, onClose, initialFocus });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center shell:items-center">
      <div className="absolute inset-0 bg-black/50" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`vocal-overlay-panel relative max-h-[90vh] w-full overflow-auto rounded-t-[var(--vocal-radius-modal)] bg-bg-elev px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 shell:m-4 shell:rounded-[var(--vocal-radius-modal)] shell:p-4 ${
          placement === "sheet" ? "shell:max-w-md" : "shell:max-w-[440px]"
        }`}
      >
        <span aria-hidden="true" className="mx-auto mb-2 block h-1 w-9 rounded-full bg-line-strong shell:hidden" />
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id={titleId} className="font-[family-name:var(--font-display)] text-lg">
            {title}
          </h2>
          <IconButton label="Закрыть" onClick={onClose}>
            <IconClose />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmActions({
  onCancel,
  onConfirm,
  confirmLabel,
  cancelLabel = "Оставить",
}: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  cancelLabel?: string;
}) {
  return (
    <div className="mt-4 flex flex-wrap justify-end gap-2">
      <ActionButton variant="secondary" data-vocal-initial="safe" onClick={onCancel}>
        {cancelLabel}
      </ActionButton>
      <ActionButton variant="danger" onClick={onConfirm}>
        {confirmLabel}
      </ActionButton>
    </div>
  );
}

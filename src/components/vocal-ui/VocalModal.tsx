"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { getSheetFocusableElements, trapSheetTab } from "@/components/shell-sheet";
import { ActionButton } from "@/components/vocal-ui/ActionButton";
import { IconButton } from "@/components/vocal-ui/IconButton";
import { IconClose } from "@/components/vocal-ui/icons";

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
  const triggerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const items = panel ? getSheetFocusableElements(panel) : [];
    const safe = panel?.querySelector<HTMLElement>("[data-vocal-initial='safe']");
    const target = initialFocus === "safe" ? (safe ?? items[0]) : items[0];
    (target ?? panel)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (panel) trapSheetTab(event, panel, document.activeElement);
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      triggerRef.current?.focus();
    };
  }, [open, initialFocus]);

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
        className={`relative max-h-[90vh] w-full overflow-auto bg-bg-elev p-4 ${
          placement === "sheet"
            ? "rounded-t-[var(--vocal-radius-modal)] shell:max-w-md shell:rounded-[var(--vocal-radius-modal)]"
            : "m-4 max-w-[440px] rounded-[var(--vocal-radius-modal)]"
        }`}
      >
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

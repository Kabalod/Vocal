"use client";

import { useEffect, useRef, type RefObject } from "react";
import { getSheetFocusableElements, trapSheetTab } from "@/components/shell-sheet";

/**
 * Keyboard rule of every overlay of the kit (dialog, sheet, action sheet, alert):
 * Escape closes, Tab/Shift+Tab cycle inside the panel. Pure: tested without a DOM.
 */
export function handleDialogKeyDown(
  event: { key: string; shiftKey: boolean; preventDefault: () => void },
  panel: ParentNode | null,
  active: Element | null,
  onClose: () => void,
): "close" | "trap" | null {
  if (event.key === "Escape") {
    event.preventDefault();
    onClose();
    return "close";
  }
  if (panel && trapSheetTab(event, panel, active)) return "trap";
  return null;
}

/**
 * Overlay behaviour: remembers the trigger and gives focus back to it on close, locks page scroll, moves focus into the panel
 * (first control, or the element marked data-vocal-initial='safe'), Escape closes, Tab is trapped. The backdrop is not focusable.
 */
export function useDialogBehavior({
  open,
  panelRef,
  onClose,
  initialFocus = "first",
}: {
  open: boolean;
  panelRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  initialFocus?: "first" | "safe";
}) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const triggerRef = useRef<HTMLElement | null>(null);

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
      handleDialogKeyDown(event, panel, document.activeElement, () => onCloseRef.current());
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      triggerRef.current?.focus();
    };
  }, [open, initialFocus, panelRef]);
}

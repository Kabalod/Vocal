export const SHEET_FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function shouldCycleSheetTab(activeIndex: number, count: number, shiftKey: boolean): boolean {
  if (count <= 0 || activeIndex < 0) return true;
  if (shiftKey) return activeIndex <= 0;
  return activeIndex >= count - 1;
}

export function nextSheetFocusIndex(activeIndex: number, count: number, shiftKey: boolean): number {
  if (count <= 0) return -1;
  if (activeIndex < 0) return shiftKey ? count - 1 : 0;
  if (shiftKey) return activeIndex <= 0 ? count - 1 : activeIndex - 1;
  return activeIndex >= count - 1 ? 0 : activeIndex + 1;
}

export function getSheetFocusableElements(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(SHEET_FOCUSABLE_SELECTOR)].filter((element) => {
    if (element.tabIndex < 0) return false;
    if (element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true") return false;
    if (element.hidden) return false;
    return true;
  });
}

export function trapSheetTab(
  event: { key: string; shiftKey: boolean; preventDefault: () => void },
  root: ParentNode,
  activeElement: Element | null,
): boolean {
  if (event.key !== "Tab") return false;
  event.preventDefault();
  const items = getSheetFocusableElements(root);
  if (items.length === 0) {
    if (root instanceof HTMLElement) root.focus();
    return true;
  }
  const activeIndex = items.indexOf(activeElement as HTMLElement);
  items[nextSheetFocusIndex(activeIndex, items.length, event.shiftKey)]?.focus();
  return true;
}

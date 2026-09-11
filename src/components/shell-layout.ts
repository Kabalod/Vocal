export const SHELL_DESKTOP_MIN_PX = 1200;
export const SHELL_SIDEBAR_EXPANDED_PX = 200;
export const SHELL_SIDEBAR_COLLAPSED_PX = 64;
export const SHELL_COLLAPSED_STORAGE_KEY = "vocal-shell-collapsed";

export const SHELL_DESKTOP_MEDIA = `(min-width: ${SHELL_DESKTOP_MIN_PX}px)`;

const listeners = new Set<() => void>();

export function parseShellCollapsed(raw: string | null): boolean {
  return raw === "1" || raw === "true";
}

export function readStoredShellCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return parseShellCollapsed(window.localStorage.getItem(SHELL_COLLAPSED_STORAGE_KEY));
}

export function subscribeShellCollapsed(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStoreChange);
  }
  return () => {
    listeners.delete(onStoreChange);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStoreChange);
    }
  };
}

export function writeStoredShellCollapsed(collapsed: boolean): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(SHELL_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
  }
  listeners.forEach((listener) => listener());
}

export const STUDIO_MATERIAL_TABS = [
  { id: "takes", label: "Дубли" },
  { id: "script", label: "Сценарий" },
] as const;

export const STUDIO_MOBILE_TABS = [
  { id: "takes", label: "Дубли" },
  { id: "script", label: "Сценарий" },
  { id: "dialog", label: "Диалог" },
] as const;

export type StudioMaterialTab = (typeof STUDIO_MATERIAL_TABS)[number]["id"];
export type StudioMobileTab = (typeof STUDIO_MOBILE_TABS)[number]["id"];

export function isStudioMobileTab(value: string): value is StudioMobileTab {
  return STUDIO_MOBILE_TABS.some((item) => item.id === value);
}

export function studioTabStorageKey(reelId: string) {
  return `vocal-studio-tab-v1:${reelId}`;
}

export function readStudioTab(reelId: string, fallback: StudioMobileTab): StudioMobileTab {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(studioTabStorageKey(reelId));
    return raw && isStudioMobileTab(raw) ? raw : fallback;
  } catch {
    return fallback;
  }
}

export function writeStudioTab(reelId: string, tab: StudioMobileTab) {
  try {
    window.localStorage.setItem(studioTabStorageKey(reelId), tab);
  } catch {
    /* ignore quota */
  }
}

export const STUDIO_PANELS = STUDIO_MOBILE_TABS;

export const STUDIO_TABS = [
  { id: "takes", label: "Дубли" },
  { id: "dialog", label: "Диалог" },
  { id: "script", label: "Сценарий" },
] as const;

export const STUDIO_MOBILE_TABS = STUDIO_TABS;
export const STUDIO_MATERIAL_TABS = STUDIO_TABS.filter((item) => item.id !== "dialog");

export type StudioMobileTab = (typeof STUDIO_TABS)[number]["id"];
export type StudioMaterialTab = Exclude<StudioMobileTab, "dialog">;

export function isStudioMobileTab(value: string): value is StudioMobileTab {
  return STUDIO_TABS.some((item) => item.id === value);
}

export function parseStudioTab(value: string | null | undefined, fallback: StudioMobileTab = "takes"): StudioMobileTab {
  return value && isStudioMobileTab(value) ? value : fallback;
}

export function studioThoughtHref(reelId: string, tab: StudioMobileTab): string {
  return `/reels/${reelId}?tab=${tab}`;
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

export const ARCHIVE_DENSITY_KEY = "vocal-archive-density-v1";
/** "compact" is the grid of upright polaroids (the default, P5), "large" is the desk, "list" are rows. */
export type ArchiveDensity = "large" | "compact" | "list";
export const DEFAULT_ARCHIVE_DENSITY: ArchiveDensity = "compact";

export function isArchiveDensity(value: string | null | undefined): value is ArchiveDensity {
  return value === "large" || value === "compact" || value === "list";
}

export function readArchiveDensity(): ArchiveDensity {
  if (typeof window === "undefined") return DEFAULT_ARCHIVE_DENSITY;
  try {
    const raw = window.localStorage.getItem(ARCHIVE_DENSITY_KEY);
    if (isArchiveDensity(raw)) return raw;
    return DEFAULT_ARCHIVE_DENSITY;
  } catch {
    return DEFAULT_ARCHIVE_DENSITY;
  }
}

export function writeArchiveDensity(value: ArchiveDensity) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ARCHIVE_DENSITY_KEY, value);
  } catch {
    /* ignore quota */
  }
}

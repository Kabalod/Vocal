export const ARCHIVE_DENSITY_KEY = "vocal-archive-density-v1";
export type ArchiveDensity = "large" | "compact" | "list";

export function isArchiveDensity(value: string | null | undefined): value is ArchiveDensity {
  return value === "large" || value === "compact" || value === "list";
}

export function readArchiveDensity(): ArchiveDensity {
  if (typeof window === "undefined") return "large";
  try {
    const raw = window.localStorage.getItem(ARCHIVE_DENSITY_KEY);
    if (isArchiveDensity(raw)) return raw;
    return "large";
  } catch {
    return "large";
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

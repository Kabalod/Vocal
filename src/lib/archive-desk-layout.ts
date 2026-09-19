export const ARCHIVE_DESK_SPREAD_SIZE = 6;
export type ArchiveDeskSlot = 1 | 2 | 3 | 4 | 5 | 6;

export function chunkArchiveDeskSpreads<T>(items: readonly T[]): T[][] {
  const spreads: T[][] = [];
  for (let i = 0; i < items.length; i += ARCHIVE_DESK_SPREAD_SIZE) {
    spreads.push(items.slice(i, i + ARCHIVE_DESK_SPREAD_SIZE));
  }
  return spreads;
}

export function archiveDeskSlot(indexInSpread: number): ArchiveDeskSlot {
  return ((indexInSpread % ARCHIVE_DESK_SPREAD_SIZE) + 1) as ArchiveDeskSlot;
}

export function archiveDeskSpreadKind(count: number): "single" | "full" {
  return count > 0 && count <= 3 ? "single" : "full";
}

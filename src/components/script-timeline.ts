export function timelineVersions<T extends { id: string; createdAt: string }>(versions: T[]): T[] {
  return [...versions].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export function timelineIndex(versions: { id: string; createdAt: string }[], viewingId: string | null): number {
  const list = timelineVersions(versions);
  if (list.length === 0) return 0;
  const index = list.findIndex((row) => row.id === viewingId);
  return index < 0 ? list.length - 1 : index;
}

export function timelineNeighbor(
  versions: { id: string; createdAt: string }[],
  viewingId: string | null,
  delta: -1 | 1,
): string | null {
  const list = timelineVersions(versions);
  const next = timelineIndex(versions, viewingId) + delta;
  return list[next]?.id ?? null;
}

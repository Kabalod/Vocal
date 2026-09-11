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

export function timelineValueText(options: {
  index: number;
  total: number;
  isHead: boolean;
  isFinal: boolean;
}): string {
  const parts = [`Версия ${options.index + 1} из ${options.total}`];
  if (options.isHead) parts.push("активная");
  if (options.isFinal) parts.push("финальная");
  return parts.join(", ");
}

export function timelineTickStates(
  versions: { id: string; createdAt: string }[],
  viewingId: string | null,
  headId: string | null,
  finalScriptId: string | null,
): Array<{ id: string; viewing: boolean; head: boolean; final: boolean }> {
  const list = timelineVersions(versions);
  const index = timelineIndex(versions, viewingId);
  return list.map((row, i) => ({
    id: row.id,
    viewing: i === index,
    head: row.id === headId,
    final: row.id === finalScriptId,
  }));
}

export function timelineTickGapClass(count: number): string {
  if (count > 20) return "gap-px";
  if (count > 8) return "gap-0.5";
  return "gap-1";
}

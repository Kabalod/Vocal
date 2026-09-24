/** Resolve the working take by stored id. Do not infer from the first two takes. */
export function resolveWorkingTake<T extends { id: string }>(
  reel: { workingTakeId?: string | null; selectedTakeId?: string | null; takes: T[] },
): T | undefined {
  if (reel.workingTakeId) {
    const working = reel.takes.find((row) => row.id === reel.workingTakeId);
    if (working) return working;
  }
  if (reel.selectedTakeId) {
    const selected = reel.takes.find((row) => row.id === reel.selectedTakeId);
    if (selected) return selected;
  }
  return reel.takes[0];
}

export function nextTabIndex(current: number, count: number, key: string): number | null {
  if (count <= 0) return null;
  const index = Math.min(Math.max(current, 0), count - 1);
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowRight" || key === "ArrowDown") return (index + 1) % count;
  if (key === "ArrowLeft" || key === "ArrowUp") return (index - 1 + count) % count;
  return null;
}

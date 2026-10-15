/** Keyboard step inside a menu: arrows wrap around, Home/End jump, disabled rows are skipped. Returns the next index or null. */
export function nextMenuIndex(current: number, key: string, disabled: readonly boolean[]): number | null {
  const count = disabled.length;
  if (count === 0 || disabled.every(Boolean)) return null;
  const step = (from: number, dir: 1 | -1) => {
    let i = from;
    for (let n = 0; n < count; n += 1) {
      i = (i + dir + count) % count;
      if (!disabled[i]) return i;
    }
    return null;
  };
  if (key === "ArrowDown") return step(current, 1);
  if (key === "ArrowUp") return step(current < 0 ? 0 : current, -1);
  if (key === "Home") return disabled[0] ? step(0, 1) : 0;
  if (key === "End") return disabled[count - 1] ? step(count - 1, -1) : count - 1;
  return null;
}

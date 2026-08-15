export function formatClock(seconds?: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatRange(start?: number, end?: number): string | null {
  if (start == null) return null;
  if (end == null) return formatClock(start);
  return `${formatClock(start)}–${formatClock(end)}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function scoreTone(score: number): string {
  if (score >= 8) return "good";
  if (score >= 5.5) return "ok";
  return "bad";
}

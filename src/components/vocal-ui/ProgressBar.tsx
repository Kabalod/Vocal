export type ProgressTone = "accent" | "usage";

/** `usage`: the bar fills as something is spent (a resource): accent, then warning, then danger at the thresholds. */
export const PROGRESS_THRESHOLDS = { warn: 70, danger: 90 } as const;

export function progressToneClass(value: number, tone: ProgressTone, thresholds: { warn: number; danger: number } = PROGRESS_THRESHOLDS): string {
  if (tone !== "usage") return "bg-accent";
  if (value >= thresholds.danger) return "bg-bad";
  if (value >= thresholds.warn) return "bg-[var(--status-progress)]";
  return "bg-accent";
}

export function ProgressBar({
  value,
  label,
  tone = "accent",
  thresholds,
  showValue = false,
}: {
  value: number;
  label: string;
  tone?: ProgressTone;
  thresholds?: { warn: number; danger: number };
  showValue?: boolean;
}) {
  const clamped = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  return (
    <div className="space-y-2">
      <p className="flex justify-between gap-3 text-sm text-muted">
        <span>{label}</span>
        {showValue ? <span className="tabular-nums">{Math.round(clamped)}%</span> : null}
      </p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
        aria-label={label}
        className="h-2 overflow-hidden rounded-full bg-bg"
      >
        <div className={`h-full rounded-full ${progressToneClass(clamped, tone, thresholds)}`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

export function ProcessingState({
  label,
  hint,
}: {
  label: string;
  hint?: string;
}) {
  return (
    <div className="vocal-card space-y-2 p-4" role="status" aria-live="polite">
      <p className="text-sm text-text">{label}</p>
      {hint ? <p className="text-sm text-muted">{hint}</p> : null}
      <div className="h-1 overflow-hidden rounded-full bg-bg">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
      </div>
    </div>
  );
}

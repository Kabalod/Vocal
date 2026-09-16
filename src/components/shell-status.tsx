"use client";

export function ShellLoading({ label = "Загрузка…" }: { label?: string }) {
  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <div className="h-24 animate-pulse rounded-panel bg-surface" />
      <div className="h-12 animate-pulse rounded-control bg-surface" />
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}

export function ShellError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="vocal-card p-6" role="alert">
      <p className="text-bad">{message}</p>
      {onRetry ? (
        <button type="button" className="vocal-btn mt-4" onClick={onRetry}>
          Повторить
        </button>
      ) : null}
    </div>
  );
}

export function ShellEmpty({ title, description }: { title: string; description?: string }) {
  return (
    <div className="vocal-card p-6">
      <p className="font-[family-name:var(--font-display)] text-xl">{title}</p>
      {description ? <p className="mt-2 text-sm text-muted">{description}</p> : null}
    </div>
  );
}

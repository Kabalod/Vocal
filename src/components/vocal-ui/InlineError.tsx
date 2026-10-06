import type { ReactNode } from "react";

export function InlineError({
  message,
  code,
  action,
}: {
  message: string;
  code?: string | null;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[var(--vocal-radius-control)] border border-bad/40 bg-surface p-3" role="alert">
      <p className="text-sm text-bad">{message}</p>
      {code ? <p className="mt-1 text-xs text-muted">Код: {code.split("|")[0]}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

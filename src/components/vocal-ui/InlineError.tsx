import type { ReactNode } from "react";

export function InlineError({
  message,
  action,
}: {
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[var(--vocal-radius-control)] border border-bad/40 bg-surface p-3" role="alert">
      <p className="text-sm text-bad">{message}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

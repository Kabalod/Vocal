import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ActionButtonVariant = "primary" | "secondary" | "compact" | "danger";

const VARIANTS: Record<ActionButtonVariant, string> = {
  primary: "border-transparent bg-accent text-on-accent shadow-[var(--vocal-shadow-cta)]",
  secondary: "border-line bg-surface text-text",
  compact: "border-transparent bg-transparent text-muted hover:text-text px-2",
  danger: "border-bad/40 bg-transparent text-bad",
};

export function ActionButton({
  variant = "secondary",
  loading = false,
  loadingLabel,
  disabledReason,
  children,
  className = "",
  disabled,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ActionButtonVariant;
  loading?: boolean;
  loadingLabel?: string;
  disabledReason?: string;
  children: ReactNode;
}) {
  const isDisabled = disabled || loading;
  return (
    <span className="inline-flex max-w-full flex-col items-start gap-1">
      <button
        type={type}
        className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-[var(--vocal-radius-control)] border px-4 text-sm ${
          variant === "primary" ? "min-h-12" : ""
        } ${VARIANTS[variant]} ${className}`}
        {...props}
        disabled={isDisabled}
        aria-busy={loading || undefined}
      >
        {loading ? loadingLabel ?? children : children}
      </button>
      {isDisabled && disabledReason ? <span className="text-xs text-muted">{disabledReason}</span> : null}
    </span>
  );
}

import type { ButtonHTMLAttributes, ReactNode } from "react";

/** `compact` is the old name of `ghost`, kept so existing screens do not change; new code uses `ghost`. */
export type ActionButtonVariant = "primary" | "secondary" | "ghost" | "compact" | "danger";

const GHOST = "border-transparent bg-transparent px-2 text-muted hover:bg-white/5 hover:text-text";

const VARIANTS: Record<ActionButtonVariant, string> = {
  primary: "border-transparent bg-accent text-on-accent shadow-[var(--vocal-shadow-cta)]",
  secondary: "border-line-strong bg-white/5 text-text hover:bg-white/10",
  ghost: GHOST,
  compact: GHOST,
  danger: "border-bad/40 bg-transparent text-bad hover:bg-bad/10",
};

/**
 * Height: 44 px on touch widths (target size), 32 px on the desktop shell (prototype), primary 48 px on touch.
 */
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
        data-variant={variant}
        className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-[var(--vocal-radius-control)] border px-4 text-sm shell:min-h-8 ${
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

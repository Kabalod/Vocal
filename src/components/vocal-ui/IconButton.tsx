import type { ComponentProps, ReactNode } from "react";

export type IconButtonVariant = "neutral" | "microphone";

const VARIANTS: Record<IconButtonVariant, string> = {
  neutral: "text-text hover:bg-white/10",
  microphone: "bg-accent text-on-accent shadow-[var(--vocal-shadow-cta)]",
};

/** 44 px target on touch widths; 32 px on the desktop shell. The accessible name is always `label`. */
export function IconButton({
  label,
  variant = "neutral",
  children,
  className = "",
  type = "button",
  ...props
}: ComponentProps<"button"> & {
  label: string;
  variant?: IconButtonVariant;
  children: ReactNode;
}) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      data-variant={variant}
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--vocal-radius-control)] shell:h-8 shell:w-8 ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

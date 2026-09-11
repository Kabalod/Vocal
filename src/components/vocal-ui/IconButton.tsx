import type { ButtonHTMLAttributes, ReactNode } from "react";

export type IconButtonVariant = "neutral" | "microphone";

const VARIANTS: Record<IconButtonVariant, string> = {
  neutral: "text-text hover:bg-field",
  microphone: "bg-accent text-on-accent shadow-[var(--vocal-shadow-cta)]",
};

export function IconButton({
  label,
  variant = "neutral",
  children,
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
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
      className={`inline-flex h-11 w-11 items-center justify-center rounded-[var(--vocal-radius-control)] ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

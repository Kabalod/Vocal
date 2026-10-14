import type { ButtonHTMLAttributes, ReactNode } from "react";
import { IconClose } from "@/components/vocal-ui/icons";

/**
 * A pill of 30 px. Plain: a button (pressed state via `selected`). With `onRemove`: a label plus a separate × button named
 * "Убрать: <label>". The pill is the look; the touch target is extended by the pseudo-element.
 */
export function Chip({
  children,
  label,
  selected = false,
  onRemove,
  removeLabel,
  className = "",
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  children?: ReactNode;
  /** Text used for the remove button's name when the children are not plain text. */
  label?: string;
  selected?: boolean;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  const look = selected
    ? "border-accent/40 bg-accent/[0.12] text-text"
    : "border-line-strong bg-white/[0.03] text-text-soft hover:bg-white/[0.07]";
  if (onRemove) {
    const name = removeLabel ?? `Убрать: ${label ?? (typeof children === "string" ? children : "фильтр")}`;
    return (
      <span className={`inline-flex h-[30px] items-center gap-1 rounded-full border-[0.5px] pl-3 pr-1 text-xs font-medium ${look} ${className}`} data-chip="removable">
        <span>{children ?? label}</span>
        <button
          type="button"
          aria-label={name}
          title={name}
          onClick={onRemove}
          className="relative inline-flex h-[22px] w-[22px] items-center justify-center rounded-full hover:bg-white/10 after:absolute after:-inset-2 after:content-['']"
        >
          <IconClose className="h-3.5 w-3.5" />
        </button>
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`relative inline-flex h-[30px] items-center rounded-full border-[0.5px] px-3 text-xs font-medium after:absolute after:-inset-[7px] after:content-[''] ${look} ${className}`}
      {...props}
    >
      {children ?? label}
    </button>
  );
}

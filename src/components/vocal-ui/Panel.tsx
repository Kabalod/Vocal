import type { HTMLAttributes, ReactNode } from "react";

/** Hairline 0.5 px border, radius 12, a one-pixel inner highlight (the look comes from `.vocal-card`). */
export function Panel({
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={`vocal-card min-w-0 overflow-x-hidden p-4 ${className}`} {...props}>
      {children}
    </div>
  );
}

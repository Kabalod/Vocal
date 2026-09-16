import type { HTMLAttributes, ReactNode } from "react";

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

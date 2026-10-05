import type { ReactNode } from "react";
import { StatusBadge } from "@/components/vocal-ui/StatusBadge";
import { thoughtUserStatus } from "@/lib/thought-preview";
import type { ReelStatus } from "@/types/reel";

export function ThoughtStudioHeader({
  title,
  status,
  action,
}: {
  title: string;
  status: ReelStatus;
  action?: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <h1 className="min-w-0 break-words font-[family-name:var(--font-display)] text-3xl">{title}</h1>
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={thoughtUserStatus(status)} />
        {action}
      </div>
    </div>
  );
}

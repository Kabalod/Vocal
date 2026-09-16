import { StatusBadge } from "@/components/vocal-ui/StatusBadge";
import { thoughtUserStatus } from "@/lib/thought-preview";
import type { ReelStatus } from "@/types/reel";

export function ThoughtStudioHeader({
  title,
  status,
}: {
  title: string;
  status: ReelStatus;
}) {
  return (
    <div className="space-y-3">
      <h1 className="min-w-0 break-words font-[family-name:var(--font-display)] text-3xl">{title}</h1>
      <StatusBadge status={thoughtUserStatus(status)} />
    </div>
  );
}

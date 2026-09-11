import { IconStatusDone, IconStatusOpen, IconStatusProgress } from "@/components/vocal-ui/icons";
import { VOCAL_USER_STATUSES, type VocalUserStatusId } from "@/components/vocal-ui/kit";

const ICONS = {
  open: IconStatusOpen,
  in_progress: IconStatusProgress,
  completed: IconStatusDone,
} as const;

export function StatusBadge({
  status,
  label,
}: {
  status: VocalUserStatusId;
  label?: string;
}) {
  const Icon = ICONS[status];
  const text = label ?? VOCAL_USER_STATUSES.find((item) => item.id === status)?.label ?? status;
  return (
    <span className="vocal-badge gap-1.5 text-muted">
      <Icon />
      {text}
    </span>
  );
}

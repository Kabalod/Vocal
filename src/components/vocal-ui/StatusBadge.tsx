import { VOCAL_USER_STATUSES, type VocalUserStatusId } from "@/components/vocal-ui/kit";

const DOT: Record<VocalUserStatusId, string> = {
  open: "bg-[var(--status-open)]",
  in_progress: "bg-[var(--status-progress)]",
  completed: "bg-[var(--status-done)]",
};

/** A token with a dot in the colour of the status; the label is the text (colour is never the only signal). */
export function StatusBadge({
  status,
  label,
}: {
  status: VocalUserStatusId;
  label?: string;
}) {
  const text = label ?? VOCAL_USER_STATUSES.find((item) => item.id === status)?.label ?? status;
  return (
    <span className="vocal-badge gap-1.5 text-text-soft" data-status={status}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DOT[status]}`} />
      {text}
    </span>
  );
}

import type { ReelStatus } from "@/types/reel";

export function ReelStatusIcon({ status }: { status: ReelStatus }) {
  const common = "h-4 w-4 shrink-0";
  if (status === "completed") {
    return (
      <svg aria-hidden className={`${common} text-good`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="8" />
        <path d="M8.5 12.5 11 15l4.5-5" />
      </svg>
    );
  }
  if (status === "in_progress") {
    return (
      <svg aria-hidden className={`${common} text-accent`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v4l3 2" />
      </svg>
    );
  }
  if (status === "ready_to_record") {
    return (
      <svg aria-hidden className={`${common} text-accent`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (status === "archived") {
    return (
      <svg aria-hidden className={`${common} text-muted`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 7h16M6 7v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7M9 11h6" />
      </svg>
    );
  }
  return (
    <svg aria-hidden className={`${common} text-muted`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <rect x="6" y="5" width="12" height="14" rx="2" />
      <path d="M9 9h6M9 13h4" />
    </svg>
  );
}

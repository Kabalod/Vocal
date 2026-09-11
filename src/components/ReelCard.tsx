import { useRouter } from "next/navigation";
import { SHELL_DESKTOP_MIN_PX } from "@/components/shell-layout";
import { IconStatusDone, IconStatusOpen, IconStatusProgress } from "@/components/vocal-ui/icons";
import { thoughtUserStatus } from "@/lib/thought-preview";
import { formatDate } from "@/lib/format";
import { REEL_STATUS_GROUP_LABELS, type ReelListItemDto } from "@/types/reel";

const GROUP_ICONS = {
  open: IconStatusOpen,
  in_progress: IconStatusProgress,
  completed: IconStatusDone,
} as const;

export function ReelCard({
  reel,
  selected = false,
  onSelect,
}: {
  reel: ReelListItemDto;
  selected?: boolean;
  onSelect?: (id: string) => void;
}) {
  const router = useRouter();
  const groupLabel = REEL_STATUS_GROUP_LABELS[reel.statusGroup];
  const userStatus = thoughtUserStatus(reel.statusGroup);
  const Icon = GROUP_ICONS[userStatus];

  function openThought() {
    if (typeof window !== "undefined" && window.matchMedia(`(min-width: ${SHELL_DESKTOP_MIN_PX}px)`).matches) {
      onSelect?.(reel.id);
      return;
    }
    router.push(`/reels/${reel.id}`);
  }

  return (
    <button
      type="button"
      onClick={openThought}
      aria-pressed={selected}
      aria-current={selected ? "true" : undefined}
      className={`vocal-card block h-full w-full p-5 text-left transition-colors hover:border-accent/40 focus-visible:border-accent ${
        selected ? "border-accent" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium leading-snug">{reel.title}</p>
        <p className="shrink-0 text-sm text-muted">{formatDate(reel.updatedAt)}</p>
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
        <Icon className="h-4 w-4" />
        <span>
          {groupLabel} · дублей: {reel.takeCount}
          {reel.hasScript ? " · есть сценарий" : ""}
        </span>
      </p>
      {reel.preview ? <p className="mt-3 line-clamp-2 text-sm text-text/85">{reel.preview}</p> : null}
    </button>
  );
}

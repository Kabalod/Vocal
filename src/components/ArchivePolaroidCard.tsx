import Link from "next/link";
import type { CSSProperties } from "react";
import {
  IconStatusDone,
  IconStatusOpen,
  IconStatusProgress,
} from "@/components/vocal-ui/icons";
import { studioThoughtHref } from "@/components/reel-studio";
import { archiveCardBackgroundImage } from "@/lib/archive-visual-assets";
import { thoughtUserStatus } from "@/lib/thought-preview";
import type { ReelListItemDto } from "@/types/reel";

const STATUS_ICONS = {
  open: IconStatusOpen,
  in_progress: IconStatusProgress,
  completed: IconStatusDone,
} as const;

const STATUS_LABELS = {
  open: "Не завершена",
  in_progress: "В работе",
  completed: "Успешно завершена",
} as const;

function PolaroidStatus({ reel, size }: { reel: ReelListItemDto; size: "desktop" | "mobile" }) {
  const userStatus = thoughtUserStatus(reel.statusGroup);
  const StatusIcon = STATUS_ICONS[userStatus];
  const statusLabel = STATUS_LABELS[userStatus];

  return (
    <span className="archive-polaroid-status" role="img" aria-label={statusLabel}>
      <StatusIcon aria-hidden className={size === "desktop" ? "h-7 w-7 shrink-0" : "h-6 w-6 shrink-0"} />
    </span>
  );
}

function PolaroidFace({
  reel,
  compact,
}: {
  reel: ReelListItemDto;
  compact?: boolean;
}) {
  return (
    <div
      className={`archive-polaroid-frame ${compact ? "archive-polaroid-frame-mobile" : ""}`}
      style={{ "--archive-card-image": archiveCardBackgroundImage(reel.id) } as CSSProperties}
    >
      <span className="archive-polaroid-info" aria-hidden="true">
        <span className="archive-polaroid-info-mark">i</span>
      </span>
      <p className="archive-polaroid-title">{reel.title}</p>
    </div>
  );
}

export function ArchivePolaroidCard({
  reel,
  variant = "desktop",
  onOpenPreview,
  onLeaveToStudio,
}: {
  reel: ReelListItemDto;
  variant?: "desktop" | "mobile";
  onOpenPreview: () => void;
  onLeaveToStudio?: () => void;
}) {
  const dialogHref = studioThoughtHref(reel.id, "dialog");
  const compact = variant === "mobile";

  return (
    <article
      className={`archive-polaroid ${compact ? "archive-polaroid-mobile" : ""}`}
      data-archive-reel={reel.id}
    >
      <PolaroidStatus reel={reel} size={compact ? "mobile" : "desktop"} />
      <button
        type="button"
        className="archive-polaroid-preview"
        aria-label={`Открыть превью мысли «${reel.title}»`}
        onClick={(event) => {
          event.stopPropagation();
          onOpenPreview();
        }}
      >
        <PolaroidFace reel={reel} compact={compact} />
      </button>
      <Link
        href={dialogHref}
        className="archive-polaroid-footer"
        aria-label={`Открыть диалог мысли «${reel.title}»`}
        onClick={(event) => {
          event.stopPropagation();
          onLeaveToStudio?.();
        }}
      >
        <span aria-hidden="true" className="archive-polaroid-footer-mark">
          →
        </span>
      </Link>
    </article>
  );
}

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
  completed: "Завершена",
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
      <p className="archive-polaroid-title">{reel.title}</p>
    </div>
  );
}

/**
 * One polaroid of the library (P5). The "i" opens the preview; the rest of the card — the frame and the footer — is one link that
 * opens the thought. The status is a mark only: it changes by product events, never by a tap.
 */
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
        className="archive-polaroid-info"
        aria-label={`Предпросмотр мысли «${reel.title}»`}
        onClick={(event) => {
          event.stopPropagation();
          onOpenPreview();
        }}
      >
        <span className="archive-polaroid-info-mark" aria-hidden="true">
          i
        </span>
      </button>
      <Link
        href={dialogHref}
        className="archive-polaroid-preview"
        aria-label={`Открыть мысль «${reel.title}»`}
        onClick={() => onLeaveToStudio?.()}
      >
        <PolaroidFace reel={reel} compact={compact} />
        <span className="archive-polaroid-footer" aria-hidden="true">
          <span className="archive-polaroid-footer-mark">→</span>
        </span>
      </Link>
    </article>
  );
}

import Link from "next/link";
import {
  IconStatusDone,
  IconStatusOpen,
  IconStatusProgress,
} from "@/components/vocal-ui/icons";
import { studioThoughtHref } from "@/components/reel-studio";
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

function PolaroidStatus({ reel }: { reel: ReelListItemDto }) {
  const userStatus = thoughtUserStatus(reel.statusGroup);
  const StatusIcon = STATUS_ICONS[userStatus];
  const statusLabel = STATUS_LABELS[userStatus];

  return (
    <span className="archive-polaroid-status" role="img" aria-label={statusLabel}>
      <StatusIcon aria-hidden />
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
    <div className={`archive-polaroid-frame ${compact ? "archive-polaroid-frame-mobile" : ""}`}>
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

  if (variant === "mobile") {
    return (
      <article className="archive-polaroid archive-polaroid-mobile" data-archive-reel={reel.id}>
        <PolaroidStatus reel={reel} />
        <button
          type="button"
          className="archive-polaroid-preview"
          aria-label={`Открыть превью мысли «${reel.title}»`}
          onClick={(event) => {
            event.stopPropagation();
            onOpenPreview();
          }}
        >
          <PolaroidFace reel={reel} compact />
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
          <span aria-hidden="true" className="text-lg leading-none text-[#1a1424]">
            →
          </span>
        </Link>
      </article>
    );
  }

  return (
    <article className="archive-polaroid" data-archive-reel={reel.id}>
      <button
        type="button"
        className="archive-polaroid-info"
        aria-label={`Открыть превью мысли «${reel.title}»`}
        onClick={(event) => {
          event.stopPropagation();
          onOpenPreview();
        }}
      >
        i
      </button>
      <Link
        href={dialogHref}
        className="block min-w-0 text-left outline-none"
        onClick={() => onLeaveToStudio?.()}
      >
        <div className="archive-polaroid-frame">
          <PolaroidStatus reel={reel} />
          <p className="archive-polaroid-title">{reel.title}</p>
        </div>
        <div className="archive-polaroid-footer">
          <span aria-hidden="true" className="text-lg leading-none text-[#1a1424]">
            →
          </span>
          <span className="sr-only">Открыть диалог мысли</span>
        </div>
      </Link>
    </article>
  );
}

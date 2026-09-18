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

function PolaroidFace({
  reel,
  compact,
}: {
  reel: ReelListItemDto;
  compact?: boolean;
}) {
  const userStatus = thoughtUserStatus(reel.statusGroup);
  const StatusIcon = STATUS_ICONS[userStatus];
  const statusLabel = STATUS_LABELS[userStatus];

  return (
    <div className={`archive-polaroid-frame ${compact ? "archive-polaroid-frame-mobile" : ""}`}>
      <span className="archive-polaroid-status" title={statusLabel}>
        <StatusIcon aria-hidden />
        <span className="sr-only">{statusLabel}</span>
      </span>
      <p className="archive-polaroid-title">{reel.title}</p>
    </div>
  );
}

export function ArchivePolaroidCard({
  reel,
  variant = "desktop",
}: {
  reel: ReelListItemDto;
  variant?: "desktop" | "mobile";
}) {
  const dialogHref = studioThoughtHref(reel.id, "dialog");

  if (variant === "mobile") {
    return (
      <article className="archive-polaroid archive-polaroid-mobile">
        <button
          type="button"
          className="archive-polaroid-preview"
          aria-label={`Превью мысли «${reel.title}». Содержимое появится позже.`}
          disabled
          title="Превью появится на следующем этапе"
          onClick={(event) => event.stopPropagation()}
        >
          <PolaroidFace reel={reel} compact />
        </button>
        <Link
          href={dialogHref}
          className="archive-polaroid-footer"
          aria-label={`Открыть диалог мысли «${reel.title}»`}
          onClick={(event) => event.stopPropagation()}
        >
          <span aria-hidden="true" className="text-lg leading-none text-[#1a1424]">
            →
          </span>
        </Link>
      </article>
    );
  }

  return (
    <article className="archive-polaroid">
      <button
        type="button"
        className="archive-polaroid-info"
        aria-label="Подробнее — превью появится позже"
        disabled
        title="Превью появится на следующем этапе"
        onClick={(event) => event.stopPropagation()}
      >
        i
      </button>
      <Link href={dialogHref} className="block min-w-0 text-left outline-none">
        <PolaroidFace reel={reel} />
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

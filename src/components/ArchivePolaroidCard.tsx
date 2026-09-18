import Link from "next/link";
import {
  IconStatusDone,
  IconStatusOpen,
  IconStatusProgress,
} from "@/components/vocal-ui/icons";
import { thoughtUserStatus } from "@/lib/thought-preview";
import { formatDate } from "@/lib/format";
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

export function ArchivePolaroidCard({ reel }: { reel: ReelListItemDto }) {
  const userStatus = thoughtUserStatus(reel.statusGroup);
  const StatusIcon = STATUS_ICONS[userStatus];
  const statusLabel = STATUS_LABELS[userStatus];

  return (
    <article className="archive-polaroid">
      <button
        type="button"
        className="archive-polaroid-info"
        aria-label="Подробнее — превью появится позже"
        disabled
        title="Превью появится на следующем этапе"
      >
        i
      </button>
      <Link href={`/reels/${reel.id}`} className="block min-w-0 text-left outline-none">
        <div className="archive-polaroid-frame">
          <p className="archive-polaroid-title">{reel.title}</p>
          <span className="inline-flex items-center gap-2 text-sm text-accent-soft" title={statusLabel}>
            <StatusIcon aria-hidden />
            <span className="sr-only">{statusLabel}</span>
          </span>
        </div>
        <div className="archive-polaroid-footer">
          <time dateTime={reel.createdAt}>{formatDate(reel.createdAt)}</time>
          <span aria-hidden="true" className="text-base leading-none text-[#1a1424]">
            →
          </span>
          <span className="sr-only">Открыть диалог мысли</span>
        </div>
      </Link>
    </article>
  );
}

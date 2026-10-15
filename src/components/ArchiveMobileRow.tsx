import Link from "next/link";
import type { CSSProperties } from "react";
import { IconStatusDone, IconStatusOpen, IconStatusProgress } from "@/components/vocal-ui/icons";
import { studioThoughtHref } from "@/components/reel-studio";
import { takesCountLabel } from "@/components/takes-path";
import { archiveCardBackgroundImage } from "@/lib/archive-visual-assets";
import { thoughtUserStatus } from "@/lib/thought-preview";
import type { ReelListItemDto } from "@/types/reel";

const STATUS = {
  open: { Icon: IconStatusOpen, label: "Не завершена" },
  in_progress: { Icon: IconStatusProgress, label: "В работе" },
  completed: { Icon: IconStatusDone, label: "Завершена" },
} as const;

export function archiveRowMeta(reel: ReelListItemDto): { status: string; takes: string; date: string } {
  const date = new Date(reel.createdAt);
  return {
    status: STATUS[thoughtUserStatus(reel.statusGroup)].label,
    takes: takesCountLabel(reel.takeCount),
    date: Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", ""),
  };
}

/** A row of the touch library: a mini polaroid, the title and one meta line. The row opens the thought, "i" opens the preview. */
export function ArchiveMobileRow({
  reel,
  onOpenPreview,
  onLeaveToStudio,
}: {
  reel: ReelListItemDto;
  onOpenPreview: () => void;
  onLeaveToStudio?: () => void;
}) {
  const { Icon } = STATUS[thoughtUserStatus(reel.statusGroup)];
  const meta = archiveRowMeta(reel);
  return (
    <li className="archive-row" data-archive-reel={reel.id} data-archive-row>
      <Link
        href={studioThoughtHref(reel.id, "dialog")}
        className="archive-row-main"
        aria-label={`Открыть мысль «${reel.title}»`}
        onClick={() => onLeaveToStudio?.()}
      >
        <span className="archive-row-thumb" style={{ "--archive-card-image": archiveCardBackgroundImage(reel.id) } as CSSProperties} aria-hidden="true" />
        <span className="archive-row-copy">
          <span className="archive-row-title">{reel.title}</span>
          <span className="archive-row-meta">
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              {meta.status} · {meta.takes} · {meta.date}
            </span>
          </span>
        </span>
      </Link>
      <button type="button" className="archive-row-info" aria-label={`Предпросмотр мысли «${reel.title}»`} onClick={onOpenPreview}>
        <span aria-hidden="true">i</span>
      </button>
    </li>
  );
}

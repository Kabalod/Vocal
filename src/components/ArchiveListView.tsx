import Link from "next/link";
import { studioThoughtHref } from "@/components/reel-studio";
import { groupArchiveListByMonth } from "@/lib/thought-archive-state";
import { thoughtUserStatus } from "@/lib/thought-preview";
import { REEL_STATUS_GROUP_LABELS } from "@/types/reel";
import type { ReelListItemDto } from "@/types/reel";

function formatListDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

export function ArchiveListView({
  reels,
  onOpenPreview,
  onLeaveToStudio,
}: {
  reels: ReelListItemDto[];
  onOpenPreview: (id: string) => void;
  onLeaveToStudio: (id: string) => void;
}) {
  const groups = groupArchiveListByMonth(reels);

  return (
    <div className="archive-list">
      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`archive-month-${group.key}`}>
          <h2 id={`archive-month-${group.key}`} className="archive-list-month">
            {group.label}
          </h2>
          <ul className="list-none p-0">
            {group.items.map((reel) => {
              const statusLabel = REEL_STATUS_GROUP_LABELS[reel.statusGroup] ?? thoughtUserStatus(reel.statusGroup);
              return (
                <li key={reel.id} className="archive-list-row" data-archive-reel={reel.id}>
                  <Link
                    href={studioThoughtHref(reel.id, "dialog")}
                    className="archive-list-main"
                    aria-label={`Открыть мысль «${reel.title}»`}
                    onClick={() => onLeaveToStudio(reel.id)}
                  >
                    <span className="archive-list-title">{reel.title}</span>
                    <span className="archive-list-date">{formatListDate(reel.createdAt)}</span>
                    <span className="archive-list-status">{statusLabel}</span>
                    <span className="archive-list-dialog" aria-hidden="true">
                      →
                    </span>
                  </Link>
                  <button
                    type="button"
                    className="archive-row-info"
                    aria-label={`Предпросмотр мысли «${reel.title}»`}
                    onClick={() => onOpenPreview(reel.id)}
                  >
                    <span aria-hidden="true">i</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

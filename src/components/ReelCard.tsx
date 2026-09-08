import Link from "next/link";
import { ReelStatusIcon } from "@/components/ReelStatusIcon";
import { formatDate } from "@/lib/format";
import { REEL_STATUS_LABELS, type ReelDto } from "@/types/reel";

export function ReelCard({ reel }: { reel: ReelDto }) {
  return (
    <Link
      href={`/reels/${reel.id}`}
      className="vocal-card block h-full p-5 transition-colors hover:border-accent/40 focus-visible:border-accent"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium leading-snug">{reel.title}</p>
        <p className="shrink-0 text-sm text-muted">{formatDate(reel.updatedAt)}</p>
      </div>
      <p className="mt-3 flex items-center gap-2 text-sm text-muted">
        <ReelStatusIcon status={reel.status} />
        <span>
          {REEL_STATUS_LABELS[reel.status]} · дублей: {reel.takeCount}
          {reel.hasScript ? " · есть сценарий" : ""}
        </span>
      </p>
      {reel.initialNote ? (
        <p className="mt-3 line-clamp-2 text-sm text-text/85">{reel.initialNote}</p>
      ) : null}
    </Link>
  );
}

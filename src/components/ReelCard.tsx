import Link from "next/link";
import { formatDate } from "@/lib/format";
import { REEL_STATUS_LABELS, type ReelDto } from "@/types/reel";

export function ReelCard({ reel }: { reel: ReelDto }) {
  return (
    <Link
      href={`/reels/${reel.id}`}
      className="block rounded-2xl border border-line bg-bg-elev p-4 hover:border-accent/40"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">{reel.title}</p>
        <p className="text-sm text-muted">{formatDate(reel.updatedAt)}</p>
      </div>
      <p className="mt-1 text-sm text-muted">
        {REEL_STATUS_LABELS[reel.status]} · дублей: {reel.takeCount}
        {reel.hasScript ? " · есть сценарий" : ""}
      </p>
      {reel.initialNote ? (
        <p className="mt-2 line-clamp-2 text-sm text-text/85">{reel.initialNote}</p>
      ) : null}
    </Link>
  );
}

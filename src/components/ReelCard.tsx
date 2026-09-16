import Link from "next/link";
import { StatusBadge } from "@/components/vocal-ui/StatusBadge";
import { thoughtUserStatus } from "@/lib/thought-preview";
import { formatDate } from "@/lib/format";
import type { ReelListItemDto } from "@/types/reel";

export function ReelCard({ reel }: { reel: ReelListItemDto }) {
  const userStatus = thoughtUserStatus(reel.statusGroup);

  return (
    <Link
      href={`/reels/${reel.id}`}
      className="vocal-card block min-w-0 w-full p-5 text-left transition-colors hover:border-accent/40"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 break-words font-medium leading-snug">{reel.title}</p>
        <p className="shrink-0 text-sm text-muted">{formatDate(reel.updatedAt)}</p>
      </div>
      <div className="mt-3">
        <StatusBadge status={userStatus} />
      </div>
      {reel.preview ? (
        <p className="mt-3 line-clamp-2 min-w-0 break-words font-content text-sm text-text-soft">{reel.preview}</p>
      ) : null}
    </Link>
  );
}

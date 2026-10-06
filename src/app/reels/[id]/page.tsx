import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ReelStudio } from "@/components/ReelStudio";
import { ShellLoading } from "@/components/shell-status";
import { resolveRequestUser, runWithOwner } from "@/lib/auth/session";
import { getReel } from "@/lib/reels";

export default async function ReelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await resolveRequestUser();
  const reel = await runWithOwner(user, () => getReel(id));
  if (!reel) notFound();
  return (
    <Suspense fallback={<ShellLoading label="Загрузка мысли…" />}>
      <ReelStudio reelId={id} />
    </Suspense>
  );
}

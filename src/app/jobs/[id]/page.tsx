import { notFound, redirect } from "next/navigation";
import { resolveRequestUser, runWithOwner } from "@/lib/auth/session";
import { ownedJobReelId } from "@/lib/job-deeplink";
import { jobDeepLinkHref } from "@/lib/legacy-routes";

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await resolveRequestUser();
  const reelId = await runWithOwner(user, () => ownedJobReelId(id));
  if (reelId === undefined) notFound();
  redirect(jobDeepLinkHref(reelId));
}

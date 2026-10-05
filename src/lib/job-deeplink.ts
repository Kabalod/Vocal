import { prisma } from "@/lib/db";
import { ownerUserId } from "@/lib/auth/session";

/** Reel id of the current owner's job: `undefined` when the job is missing or belongs to someone else. */
export async function ownedJobReelId(jobId: string): Promise<string | null | undefined> {
  const job = await prisma.job.findFirst({
    where: { id: jobId, ownerUserId: ownerUserId() },
    select: { take: { select: { reelId: true } } },
  });
  if (!job) return undefined;
  return job.take?.reelId ?? null;
}

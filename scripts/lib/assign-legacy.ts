import type { PrismaClient } from "@prisma/client";
import { PortraitConflictError, reportPortraitConflict } from "./portrait-conflict";

export async function assignLegacyOwner(prisma: PrismaClient, owner: string) {
  const local = await prisma.creatorProfile.findUnique({ where: { id: "local" } });
  const ownerPortrait = await prisma.creatorProfile.findUnique({ where: { id: owner } });
  const localRevisionCount = local
    ? await prisma.profileRevision.count({ where: { profileId: "local" } })
    : 0;
  const ownerRevisionCount = ownerPortrait
    ? await prisma.profileRevision.count({ where: { profileId: owner } })
    : 0;
  const conflict = reportPortraitConflict({
    ownerId: owner,
    local,
    owner: ownerPortrait,
    localRevisionCount,
    ownerRevisionCount,
  });
  if (conflict) throw new PortraitConflictError(conflict);

  const before = {
    reels: await prisma.reel.count({ where: { ownerUserId: "local" } }),
    jobs: await prisma.job.count({ where: { ownerUserId: "local" } }),
    aiCalls: await prisma.aiCall.count({ where: { ownerUserId: "local" } }),
    portraits: local ? 1 : 0,
  };

  await prisma.$transaction(async (tx) => {
    await tx.reel.updateMany({ where: { ownerUserId: "local" }, data: { ownerUserId: owner } });
    await tx.job.updateMany({ where: { ownerUserId: "local" }, data: { ownerUserId: owner } });
    await tx.aiCall.updateMany({ where: { ownerUserId: "local" }, data: { ownerUserId: owner } });
    if (!local) return;
    await tx.creatorProfile.create({
      data: {
        id: owner,
        ownerUserId: owner,
        currentRevisionId: local.currentRevisionId,
      },
    });
    await tx.profileRevision.updateMany({ where: { profileId: "local" }, data: { profileId: owner } });
    await tx.dialogueThread.updateMany({ where: { profileId: "local" }, data: { profileId: owner } });
    await tx.aiCall.updateMany({ where: { profileId: "local" }, data: { profileId: owner } });
    await tx.creatorProfile.delete({ where: { id: "local" } });
  });

  return {
    owner,
    before,
    after: {
      reels: await prisma.reel.count({ where: { ownerUserId: owner } }),
      leftoverLocalReels: await prisma.reel.count({ where: { ownerUserId: "local" } }),
      leftoverLocalPortrait: await prisma.creatorProfile.count({ where: { id: "local" } }),
    },
  };
}

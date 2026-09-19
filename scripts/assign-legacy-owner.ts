import { PrismaClient } from "@prisma/client";
import { legacyOwnerUserId } from "../src/lib/auth/session";

/**
 * Assigns every local-owned row to VOCAL_LEGACY_OWNER_USER_ID.
 * Does not assign to the first interactive login.
 */
async function main() {
  const owner = legacyOwnerUserId();
  const prisma = new PrismaClient();
  const before = {
    reels: await prisma.reel.count({ where: { ownerUserId: "local" } }),
    jobs: await prisma.job.count({ where: { ownerUserId: "local" } }),
    aiCalls: await prisma.aiCall.count({ where: { ownerUserId: "local" } }),
    portraits: await prisma.creatorProfile.count({ where: { id: "local" } }),
  };

  await prisma.$transaction(async (tx) => {
    await tx.reel.updateMany({ where: { ownerUserId: "local" }, data: { ownerUserId: owner } });
    await tx.job.updateMany({ where: { ownerUserId: "local" }, data: { ownerUserId: owner } });
    await tx.aiCall.updateMany({ where: { ownerUserId: "local" }, data: { ownerUserId: owner } });
    const localPortrait = await tx.creatorProfile.findUnique({ where: { id: "local" } });
    if (localPortrait) {
      const existing = await tx.creatorProfile.findUnique({ where: { id: owner } });
      if (!existing) {
        await tx.creatorProfile.create({
          data: {
            id: owner,
            ownerUserId: owner,
            currentRevisionId: localPortrait.currentRevisionId,
          },
        });
        await tx.profileRevision.updateMany({ where: { profileId: "local" }, data: { profileId: owner } });
        await tx.dialogueThread.updateMany({ where: { profileId: "local" }, data: { profileId: owner } });
        await tx.aiCall.updateMany({ where: { profileId: "local" }, data: { profileId: owner } });
        await tx.creatorProfile.delete({ where: { id: "local" } });
      }
      await tx.creatorProfile.update({ where: { id: owner }, data: { ownerUserId: owner } });
    }
  });

  const after = {
    reels: await prisma.reel.count({ where: { ownerUserId: owner } }),
    leftoverLocalReels: await prisma.reel.count({ where: { ownerUserId: "local" } }),
  };
  console.log(JSON.stringify({ owner, before, after }, null, 2));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

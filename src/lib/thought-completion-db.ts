import { prisma } from "@/lib/db";

export async function backfillFinalTakeIds(): Promise<{ hadSelected: number; copied: number }> {
  const hadSelected = await prisma.reel.count({ where: { selectedTakeId: { not: null } } });
  const copied = await prisma.$executeRaw`
    UPDATE "Reel"
    SET "finalTakeId" = "selectedTakeId"
    WHERE "selectedTakeId" IS NOT NULL
      AND "finalTakeId" IS NULL
  `;
  return { hadSelected, copied: Number(copied) };
}

import { PrismaClient } from "@prisma/client";
import path from "node:path";
import { fileURLToPath } from "node:url";

function titleFromJob(originalName: string): string {
  const base = originalName.replace(/\.[^.]+$/, "").trim();
  return base || "Ролик без названия";
}

export async function backfillReels(client: PrismaClient) {
  const jobs = await client.job.findMany({
    where: { takeId: null },
    orderBy: { createdAt: "asc" },
  });

  let created = 0;
  for (const job of jobs) {
    const didCreate = await client.$transaction(async (tx) => {
      const fresh = await tx.job.findUnique({ where: { id: job.id } });
      if (!fresh || fresh.takeId) return false;

      const reel = await tx.reel.create({
        data: {
          title: titleFromJob(fresh.originalName),
          initialNote: "",
          status: "draft",
        },
      });

      const take = await tx.take.create({
        data: {
          reelId: reel.id,
          number: 1,
          inputType: "video",
          authorNote: "",
        },
      });

      await tx.job.update({
        where: { id: fresh.id },
        data: { takeId: take.id },
      });
      return true;
    });
    if (didCreate) created += 1;
  }

  const [reels, takes, linkedJobs] = await Promise.all([
    client.reel.count(),
    client.take.count(),
    client.job.count({ where: { takeId: { not: null } } }),
  ]);

  return { scanned: jobs.length, created, reels, takes, linkedJobs };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const first = await backfillReels(prisma);
    const second = await backfillReels(prisma);
    console.log(JSON.stringify({ first, second }, null, 2));
    if (second.created !== 0 || second.reels !== first.reels || second.takes !== first.takes) {
      throw new Error("Повторный backfill изменил число карточек или создал лишние дубли.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(thisFile)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

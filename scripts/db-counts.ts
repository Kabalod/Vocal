import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

export function sha256Utf8(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

const url = process.argv[2];
const isMain = Boolean(url) && process.argv[1]?.includes("db-counts");

async function main() {
  if (!url) {
    console.error("usage: tsx scripts/db-counts.ts file:./path.db");
    process.exit(1);
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const tables = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
    );
    const jobs = await prisma.job.count();
    const results = await prisma.analysisResult.count();
    const criteria = await prisma.criterion.count();
    const payloads = await prisma.analysisResult.findMany({
      select: { id: true, jobId: true, payload: true, overallScore: true },
      orderBy: { id: "asc" },
    });
    console.log(
      JSON.stringify(
        {
          tables: tables.map((t) => t.name),
          jobs,
          results,
          criteria,
          jobIds: await prisma.job.findMany({
            select: { id: true, originalName: true, videoPath: true, status: true },
            orderBy: { createdAt: "asc" },
          }),
          payloadHashes: payloads.map((p) => ({
            id: p.id,
            jobId: p.jobId,
            overallScore: p.overallScore,
            payloadSha256: sha256Utf8(p.payload),
          })),
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

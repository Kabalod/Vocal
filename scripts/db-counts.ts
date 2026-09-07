import { PrismaClient } from "@prisma/client";

const url = process.argv[2];
if (!url) {
  console.error("usage: tsx scripts/db-counts.ts file:./path.db");
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
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
        jobIds: (await prisma.job.findMany({ select: { id: true, originalName: true, videoPath: true, status: true }, orderBy: { createdAt: "asc" } })),
        payloadHashes: payloads.map((p) => ({
          id: p.id,
          jobId: p.jobId,
          overallScore: p.overallScore,
          payloadChars: p.payload.length,
        })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { isPrivateObjectPath } from "../src/lib/media-access";

type Row = {
  kind: "take" | "job-video" | "job-audio";
  id: string;
  ownerUserId: string;
  storedPath: string;
  exists: boolean;
  privateObject: boolean;
};

async function main() {
  const prisma = new PrismaClient();
  const rows: Row[] = [];
  const takes = await prisma.take.findMany({
    select: { id: true, storedPath: true, reel: { select: { ownerUserId: true } } },
  });
  for (const take of takes) {
    if (!take.storedPath) continue;
    rows.push({
      kind: "take",
      id: take.id,
      ownerUserId: take.reel.ownerUserId,
      storedPath: take.storedPath,
      exists: isPrivateObjectPath(take.storedPath) ? false : existsSync(take.storedPath),
      privateObject: isPrivateObjectPath(take.storedPath),
    });
  }
  const jobs = await prisma.job.findMany({
    select: { id: true, videoPath: true, audioPath: true, ownerUserId: true },
  });
  for (const job of jobs) {
    if (job.videoPath && job.videoPath !== "pending") {
      rows.push({
        kind: "job-video",
        id: job.id,
        ownerUserId: job.ownerUserId,
        storedPath: job.videoPath,
        exists: isPrivateObjectPath(job.videoPath) ? false : existsSync(job.videoPath),
        privateObject: isPrivateObjectPath(job.videoPath),
      });
    }
    if (job.audioPath) {
      rows.push({
        kind: "job-audio",
        id: job.id,
        ownerUserId: job.ownerUserId,
        storedPath: job.audioPath,
        exists: isPrivateObjectPath(job.audioPath) ? false : existsSync(job.audioPath),
        privateObject: isPrivateObjectPath(job.audioPath),
      });
    }
  }
  const missing = rows.filter((row) => !row.privateObject && !row.exists);
  const localOwners = [...new Set(rows.map((row) => row.ownerUserId))];
  const summary = {
    referenced: rows.length,
    present: rows.filter((row) => row.exists || row.privateObject).length,
    missingLocal: missing.length,
    privateObjects: rows.filter((row) => row.privateObject).length,
    owners: localOwners,
  };
  const outDir = path.join(process.cwd(), "backups");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "media-audit.json");
  writeFileSync(outPath, JSON.stringify({ summary, missing: missing.map((row) => ({ kind: row.kind, id: row.id, ownerUserId: row.ownerUserId })) }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log("wrote", outPath);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

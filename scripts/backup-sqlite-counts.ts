import { mkdirSync, copyFileSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const root = process.cwd();
const sqliteUrl = process.env.DATABASE_URL || "file:./prisma/dev.db";
const filePath = sqliteUrl.replace(/^file:/, "");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = path.join(root, "backups", `sqlite-${stamp}`);

async function main() {
  mkdirSync(outDir, { recursive: true });
  if (existsSync(filePath)) {
    copyFileSync(filePath, path.join(outDir, "dev.db"));
  }
  const prisma = new PrismaClient();
  const counts = {
    reels: await prisma.reel.count(),
    takes: await prisma.take.count(),
    jobs: await prisma.job.count(),
    dialogues: await prisma.dialogueThread.count(),
    scripts: await prisma.scriptVersion.count(),
    reviews: await prisma.review.count(),
    aiCalls: await prisma.aiCall.count(),
    profiles: await prisma.creatorProfile.count(),
    revisions: await prisma.profileRevision.count(),
  };
  writeFileSync(path.join(outDir, "counts.json"), JSON.stringify(counts, null, 2));
  console.log(outDir);
  console.log(JSON.stringify(counts, null, 2));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

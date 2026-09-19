import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const COUNTED_MODELS = [
  "reel",
  "take",
  "job",
  "dialogueThread",
  "dialogueMessage",
  "scriptVersion",
  "scriptDraft",
  "review",
  "question",
  "answer",
  "aiCall",
  "creatorProfile",
  "profileRevision",
  "compareResult",
  "transcriptRevision",
] as const;

async function counts(client: PrismaClient) {
  const out: Record<string, number> = {};
  out.reels = await client.reel.count();
  out.takes = await client.take.count();
  out.jobs = await client.job.count();
  out.dialogueThreads = await client.dialogueThread.count();
  out.dialogueMessages = await client.dialogueMessage.count();
  out.scripts = await client.scriptVersion.count();
  out.scriptDrafts = await client.scriptDraft.count();
  out.reviews = await client.review.count();
  out.questions = await client.question.count();
  out.answers = await client.answer.count();
  out.aiCalls = await client.aiCall.count();
  out.portraits = await client.creatorProfile.count();
  out.portraitRevisions = await client.profileRevision.count();
  out.compares = await client.compareResult.count();
  out.transcripts = await client.transcriptRevision.count();
  return out;
}

async function main() {
  const root = process.cwd();
  const sqliteUrl = process.env.DATABASE_URL || "file:./prisma/dev.db";
  const filePath = sqliteUrl.replace(/^file:/, "");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(root, "backups", `sqlite-${stamp}`);
  mkdirSync(outDir, { recursive: true });
  if (existsSync(filePath)) {
    copyFileSync(filePath, path.join(outDir, "dev.db"));
  }

  const sqlite = new PrismaClient();
  const sqliteCounts = await counts(sqlite);
  writeFileSync(path.join(outDir, "sqlite-counts.json"), JSON.stringify(sqliteCounts, null, 2));
  console.log("sqlite backup", outDir);
  console.log("sqlite counts", sqliteCounts);

  const postgresUrl = process.env.POSTGRES_DATABASE_URL?.trim();
  if (!postgresUrl) {
    console.log("POSTGRES_DATABASE_URL unset: schema push skipped. Counts captured.");
    await sqlite.$disconnect();
    return;
  }

  execFileSync("npx", ["prisma", "db", "push", "--skip-generate", "--schema", "prisma/schema.postgres.prisma"], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: postgresUrl },
    stdio: "inherit",
    shell: true,
  });

  const tables = COUNTED_MODELS;
  writeFileSync(
    path.join(outDir, "README.txt"),
    [
      "SQLite copy and counts are here.",
      "Postgres schema was pushed with prisma/schema.postgres.prisma.",
      "Row copy: keep DATABASE_URL on sqlite for tests; set POSTGRES_DATABASE_URL for app production.",
      "Then run: npm run db:assign-legacy-owner with VOCAL_LEGACY_OWNER_USER_ID set to the predetermined auth uuid.",
      "Never assign local rows to the first interactive login.",
      `models: ${tables.join(", ")}`,
    ].join("\n"),
  );

  await sqlite.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

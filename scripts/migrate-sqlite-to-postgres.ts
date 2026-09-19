import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { loadVocalEnv } from "./lib/load-env";
import { assertConfirmedBackup, createConfirmedSqliteBackup } from "./lib/sqlite-backup";
import { countVocalModels, readVocalDump } from "./lib/copy-database";
import { resolvePrismaSchema } from "./prisma-schema";

loadVocalEnv();

function run(args: string[], env: NodeJS.ProcessEnv) {
  execFileSync("npx", args, {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
    shell: true,
  });
}

async function main() {
  const root = process.cwd();
  const sqliteUrl = process.env.DATABASE_URL?.trim();
  if (!sqliteUrl?.startsWith("file:")) {
    throw new Error("DATABASE_URL must be a sqlite file: URL for this copy.");
  }
  const postgresUrl = process.env.POSTGRES_DATABASE_URL?.trim();
  if (!postgresUrl) {
    throw new Error("POSTGRES_DATABASE_URL is required.");
  }

  const backup = createConfirmedSqliteBackup({
    databaseUrl: sqliteUrl,
    schemaPath: "prisma/schema.prisma",
    cwd: root,
  });
  assertConfirmedBackup(backup);

  const sqlite = new PrismaClient({ datasources: { db: { url: sqliteUrl } } });
  const dump = await readVocalDump(sqlite);
  const dumpPath = path.join(path.dirname(backup.dest), "vocal-dump.json");
  writeFileSync(dumpPath, JSON.stringify(dump));
  const sourceCounts = await countVocalModels(sqlite);
  await sqlite.$disconnect();

  const postgresEnv = {
    ...process.env,
    DATABASE_URL: postgresUrl,
    VOCAL_PRISMA_SCHEMA: "prisma/schema.postgres.prisma",
  };
  run(["prisma", "generate", "--schema", "prisma/schema.postgres.prisma"], postgresEnv);
  run(["prisma", "db", "push", "--schema", "prisma/schema.postgres.prisma"], postgresEnv);
  run(["tsx", "scripts/import-vocal-dump.ts", dumpPath], postgresEnv);

  const restoreSchema = resolvePrismaSchema({
    DATABASE_URL: sqliteUrl,
    VOCAL_PRISMA_SCHEMA: process.env.VOCAL_PRISMA_SCHEMA,
  });
  run(["prisma", "generate", "--schema", restoreSchema], { ...process.env, DATABASE_URL: sqliteUrl });
  console.log(JSON.stringify({ ok: true, backup: backup.dest, dump: dumpPath, sourceCounts }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

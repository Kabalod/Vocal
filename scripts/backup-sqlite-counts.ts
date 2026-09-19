import { writeFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { loadVocalEnv } from "./lib/load-env";
import { createConfirmedSqliteBackup } from "./lib/sqlite-backup";
import { countVocalModels } from "./lib/copy-database";

loadVocalEnv();

async function main() {
  const sqliteUrl = process.env.DATABASE_URL?.trim();
  if (!sqliteUrl?.startsWith("file:")) {
    throw new Error("DATABASE_URL must be a sqlite file: URL.");
  }
  const backup = createConfirmedSqliteBackup({
    databaseUrl: sqliteUrl,
    schemaPath: "prisma/schema.prisma",
  });
  const prisma = new PrismaClient({ datasources: { db: { url: sqliteUrl } } });
  const counts = await countVocalModels(prisma);
  writeFileSync(path.join(path.dirname(backup.dest), "counts.json"), JSON.stringify(counts, null, 2));
  console.log(path.dirname(backup.dest));
  console.log(JSON.stringify(counts, null, 2));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

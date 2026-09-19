import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { loadVocalEnv } from "./lib/load-env";
import { countVocalModels, writeVocalDump, type VocalDump } from "./lib/copy-database";

loadVocalEnv();

async function main() {
  const dumpPath = process.argv[2];
  if (!dumpPath) throw new Error("Usage: tsx scripts/import-vocal-dump.ts <dump.json>");
  const dump = JSON.parse(readFileSync(dumpPath, "utf8")) as VocalDump;
  const dest = new PrismaClient();
  await writeVocalDump(dest, dump);
  const destCounts = await countVocalModels(dest);
  await dest.$disconnect();
  console.log(JSON.stringify({ ok: true, destCounts }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

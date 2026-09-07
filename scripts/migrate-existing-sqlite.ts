import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const INIT = "20260907120000_init";

function runPrisma(args: string[], url: string) {
  execFileSync("npx", ["prisma", ...args], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
    shell: true,
  });
}

async function hasMigrationsTable(url: string): Promise<boolean> {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='_prisma_migrations'`,
    );
    return rows.length > 0;
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL не задан.");

  const migrated = await hasMigrationsTable(url);
  if (!migrated) {
    console.log(`БД создана через db push. Помечаю ${INIT} как applied (baseline), SQL init не выполняю.`);
    runPrisma(["migrate", "resolve", "--applied", INIT], url);
  }

  runPrisma(["migrate", "deploy"], url);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

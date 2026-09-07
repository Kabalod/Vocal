import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

export const INIT_MIGRATION = "20260907120000_init";

const LEGACY_TABLES = ["AnalysisResult", "Criterion", "Job"] as const;

const LEGACY_COLUMNS: Record<(typeof LEGACY_TABLES)[number], string[]> = {
  Job: [
    "id",
    "originalName",
    "videoPath",
    "audioPath",
    "durationSec",
    "status",
    "errorCode",
    "errorMessage",
    "createdAt",
    "updatedAt",
  ],
  AnalysisResult: ["id", "jobId", "overallScore", "summary", "payload", "createdAt"],
  Criterion: [
    "id",
    "label",
    "description",
    "weight",
    "enabled",
    "sortOrder",
    "isExtended",
    "categoryId",
    "categoryLabel",
    "categoryWeight",
    "categoryOrder",
  ],
};

export type SqliteKind = "empty" | "has_migrations" | "legacy_db_push" | "unknown";

function runPrisma(args: string[], url: string) {
  execFileSync("npx", ["prisma", ...args], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
    shell: true,
  });
}

function sameNames(actual: string[], expected: string[]): boolean {
  if (actual.length !== expected.length) return false;
  const set = new Set(actual);
  return expected.every((name) => set.has(name));
}

export async function inspectSqlite(url: string): Promise<{
  kind: SqliteKind;
  tables: string[];
  reason?: string;
}> {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    );
    const tables = rows.map((row) => row.name);
    if (tables.length === 0) return { kind: "empty", tables };
    if (tables.includes("_prisma_migrations")) return { kind: "has_migrations", tables };

    const expected = [...LEGACY_TABLES];
    if (!sameNames(tables, expected as unknown as string[])) {
      return {
        kind: "unknown",
        tables,
        reason: `Ожидались таблицы ${expected.join(", ")}, есть: ${tables.join(", ") || "(пусто)"}.`,
      };
    }

    for (const table of LEGACY_TABLES) {
      const cols = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info("${table}")`);
      const names = cols.map((col) => col.name);
      if (!sameNames(names, LEGACY_COLUMNS[table])) {
        return {
          kind: "unknown",
          tables,
          reason: `Таблица ${table}: ожидались колонки ${LEGACY_COLUMNS[table].join(", ")}, есть ${names.join(", ")}.`,
        };
      }
    }

    return { kind: "legacy_db_push", tables };
  } finally {
    await prisma.$disconnect();
  }
}

export async function applyExistingSqlite(url: string): Promise<SqliteKind> {
  const inspection = await inspectSqlite(url);
  if (inspection.kind === "unknown") {
    throw new Error(
      `Нельзя помечать baseline: схема не совпадает со старой db-push базой. ${inspection.reason ?? ""}`.trim(),
    );
  }
  if (inspection.kind === "legacy_db_push") {
    console.log(
      `Старая схема db push. Помечаю ${INIT_MIGRATION} как applied (SQL init не выполняю), затем migrate deploy.`,
    );
    runPrisma(["migrate", "resolve", "--applied", INIT_MIGRATION], url);
  } else if (inspection.kind === "empty") {
    console.log("Пустая БД. Baseline не ставлю, обычный prisma migrate deploy.");
  } else {
    console.log("История миграций уже есть. prisma migrate deploy.");
  }
  runPrisma(["migrate", "deploy"], url);
  return inspection.kind;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL не задан.");
  await applyExistingSqlite(url);
}

const isMain = process.argv[1]?.includes("migrate-existing-sqlite");
if (isMain) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { assertTestDatabaseUrl } from "../../src/lib/db-target";
import { resetPrismaClient } from "../../src/lib/db";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const baselinePath = path.join(repoRoot, "prisma/migrations/0_postgres_baseline/migration.sql");

export type PostgresTestDb = {
  prisma: PrismaClient;
  url: string;
  schema: string;
  baseUrl: string;
};

function withSchema(baseUrl: string, schema: string): string {
  const parsed = new URL(baseUrl);
  parsed.searchParams.set("schema", schema);
  return parsed.toString();
}

function applyBaseline(baseUrl: string, schema: string) {
  const baseline = readFileSync(baselinePath, "utf8").replace(
    /-- CreateSchema[\s\S]*?CREATE SCHEMA IF NOT EXISTS "public";\s*/u,
    "",
  );
  const sql = `CREATE SCHEMA "${schema}";\nSET search_path TO "${schema}";\n${baseline}`;
  execFileSync("npx", ["prisma", "db", "execute", "--stdin", "--url", baseUrl], {
    cwd: repoRoot,
    input: sql,
    stdio: ["pipe", "pipe", "pipe"],
    shell: true,
    env: {
      ...process.env,
      DATABASE_URL: baseUrl,
      DIRECT_URL: baseUrl,
    },
  });
}

export async function openPostgresTestDb(
  env: Record<string, string | undefined> = process.env,
): Promise<PostgresTestDb> {
  const baseUrl = assertTestDatabaseUrl(env.TEST_DATABASE_URL?.trim() || "", env);
  const schema = `t_${randomBytes(6).toString("hex")}`;
  applyBaseline(baseUrl, schema);
  const url = withSchema(baseUrl, schema);
  env.TEST_DATABASE_URL = url;
  env.DATABASE_URL = url;
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  return { prisma, url, schema, baseUrl };
}

export async function closePostgresTestDb(db: PostgresTestDb): Promise<void> {
  await db.prisma.$disconnect();
  const admin = new PrismaClient({ datasources: { db: { url: db.baseUrl } } });
  try {
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${db.schema}" CASCADE`);
  } finally {
    await admin.$disconnect();
  }
}

export async function withPostgresTestDb(t: { after: (fn: () => Promise<void> | void) => void }) {
  const previous = {
    TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
  };
  (process.env as { NODE_ENV?: string }).NODE_ENV = "test";
  const db = await openPostgresTestDb();
  await resetPrismaClient();
  t.after(async () => {
    await closePostgresTestDb(db);
    if (previous.TEST_DATABASE_URL === undefined) delete process.env.TEST_DATABASE_URL;
    else process.env.TEST_DATABASE_URL = previous.TEST_DATABASE_URL;
    if (previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous.DATABASE_URL;
    if (previous.NODE_ENV === undefined) delete process.env.NODE_ENV;
    else (process.env as { NODE_ENV?: string }).NODE_ENV = previous.NODE_ENV;
    await resetPrismaClient();
  });
  return db;
}

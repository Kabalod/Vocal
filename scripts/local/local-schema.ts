// Creates (once) the schema `vocal_local` with all migrations in the LOCAL Postgres from docker-compose.local.yml and prints its URL
// as the last line. `--reset` drops the schema first (all local thoughts are lost). TEST_DATABASE_URL only; Supabase is refused.
import { PrismaClient } from "@prisma/client";
import { assertTestDatabaseUrl } from "../../src/lib/db-target";
import { applyIsolatedSchemaFiles, PRE_THOUGHT_STATE_MIGRATIONS, THOUGHT_STATE_MIGRATIONS } from "../../tests/helpers/postgres-test-db";

const SCHEMA = "vocal_local";

async function main() {
  const base = assertTestDatabaseUrl(process.env.TEST_DATABASE_URL?.trim() || "");
  const admin = new PrismaClient({ datasources: { db: { url: base } } });
  try {
    if (process.argv.includes("--reset")) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    const rows = await admin.$queryRaw<{ schema_name: string }[]>`SELECT schema_name FROM information_schema.schemata WHERE schema_name = ${SCHEMA}`;
    if (rows.length === 0) {
      applyIsolatedSchemaFiles(base, SCHEMA, [...PRE_THOUGHT_STATE_MIGRATIONS, ...THOUGHT_STATE_MIGRATIONS]);
      console.error(`schema ${SCHEMA} created`);
    } else {
      console.error(`schema ${SCHEMA} already exists (use --reset to recreate)`);
    }
  } finally {
    await admin.$disconnect();
  }
  const url = new URL(base);
  url.searchParams.set("schema", SCHEMA);
  console.log(url.toString());
}

main().catch((error) => {
  console.error("local-schema failed:", error instanceof Error ? error.message.slice(0, 300) : "error");
  process.exit(1);
});

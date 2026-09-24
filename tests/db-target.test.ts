import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  DatabaseTargetError,
  assertTestDatabaseUrl,
  assertVocalPostgresUrl,
  resolveAppDatabaseUrl,
} from "../src/lib/db-target";

test("app runtime refuses sqlite and off-project postgres", () => {
  assert.throws(
    () => resolveAppDatabaseUrl({ NODE_ENV: "development", DATABASE_URL: "file:./dev.db" }),
    DatabaseTargetError,
  );
  assert.throws(
    () =>
      resolveAppDatabaseUrl({
        NODE_ENV: "development",
        DATABASE_URL: "postgresql://postgres.otherproj@localhost/postgres",
      }),
    DatabaseTargetError,
  );
  assert.throws(
    () =>
      resolveAppDatabaseUrl({
        NODE_ENV: "development",
        DATABASE_URL: `postgresql://postgres.other@aws-0-eu-west-2.pooler.supabase.com/postgres?password=zfbiyyhedhqdgrxxajrj`,
      }),
    DatabaseTargetError,
  );
  const pooler = resolveAppDatabaseUrl({
    NODE_ENV: "development",
    DATABASE_URL:
      "postgresql://postgres.zfbiyyhedhqdgrxxajrj:s3cret@aws-0-eu-west-2.pooler.supabase.com:5432/postgres",
  });
  const poolerUrl = new URL(pooler);
  assert.equal(poolerUrl.hostname, "aws-0-eu-west-2.pooler.supabase.com");
  assert.equal(poolerUrl.username, "postgres.zfbiyyhedhqdgrxxajrj");
  assert.equal(poolerUrl.searchParams.get("sslmode"), "require");

  const direct = resolveAppDatabaseUrl({
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://postgres:s3cret@db.zfbiyyhedhqdgrxxajrj.supabase.co:5432/postgres",
  });
  const directUrl = new URL(direct);
  assert.equal(directUrl.hostname, "db.zfbiyyhedhqdgrxxajrj.supabase.co");
  assert.equal(directUrl.searchParams.get("sslmode"), "require");

  assert.throws(() => resolveAppDatabaseUrl({ NODE_ENV: "test" }), DatabaseTargetError);
});

test("postgres URL is parsed, not substring-matched", () => {
  assert.throws(
    () =>
      assertVocalPostgresUrl(
        "postgresql://postgres.evil@evil.example/postgres?note=zfbiyyhedhqdgrxxajrj",
      ),
    DatabaseTargetError,
  );
  const withSsl = assertVocalPostgresUrl(
    "postgresql://postgres.zfbiyyhedhqdgrxxajrj@aws-1-eu-west-2.pooler.supabase.com:6543/postgres?sslmode=prefer",
  );
  assert.equal(new URL(withSsl).searchParams.get("sslmode"), "require");
});

test("tests accept only local postgres", () => {
  assert.equal(
    assertTestDatabaseUrl("postgresql://postgres:pass@127.0.0.1:5432/vocal_test"),
    "postgresql://postgres:pass@127.0.0.1:5432/vocal_test",
  );
  assert.throws(
    () => assertTestDatabaseUrl("file:./prisma/dev.db"),
    DatabaseTargetError,
  );
  assert.throws(
    () =>
      assertTestDatabaseUrl(
        "postgresql://postgres.zfbiyyhedhqdgrxxajrj@aws-0-eu-west-2.pooler.supabase.com:5432/postgres",
      ),
    DatabaseTargetError,
  );
});

test("public health does not return prisma or connection text", () => {
  const src = readFileSync(new URL("../src/app/api/health/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /postgresError/);
  assert.doesNotMatch(src, /error\.message/);
  assert.doesNotMatch(src, /POSTGRES_DATABASE_URL/);
  assert.match(src, /logApiError/);
});

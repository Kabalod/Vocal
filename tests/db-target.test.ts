import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DatabaseTargetError, assertVocalPostgresUrl, resolveAppDatabaseUrl } from "../src/lib/db-target";
import { resolvePrismaSchema as resolveGenerateSchema } from "../scripts/prisma-schema";

test("app runtime refuses sqlite and off-project postgres", () => {
  assert.throws(
    () => resolveAppDatabaseUrl({ NODE_ENV: "development", DATABASE_URL: "file:./dev.db" }),
    DatabaseTargetError,
  );
  assert.throws(
    () =>
      resolveAppDatabaseUrl({
        NODE_ENV: "development",
        POSTGRES_DATABASE_URL: "postgresql://postgres.otherproj@localhost/postgres",
      }),
    DatabaseTargetError,
  );
  assert.throws(
    () =>
      resolveAppDatabaseUrl({
        NODE_ENV: "development",
        POSTGRES_DATABASE_URL: `postgresql://postgres.other@aws-0-eu-west-2.pooler.supabase.com/postgres?password=zfbiyyhedhqdgrxxajrj`,
      }),
    DatabaseTargetError,
  );
  const pooler = resolveAppDatabaseUrl({
    NODE_ENV: "development",
    POSTGRES_DATABASE_URL:
      "postgresql://postgres.zfbiyyhedhqdgrxxajrj:s3cret@aws-0-eu-west-2.pooler.supabase.com:5432/postgres",
  });
  const poolerUrl = new URL(pooler);
  assert.equal(poolerUrl.hostname, "aws-0-eu-west-2.pooler.supabase.com");
  assert.equal(poolerUrl.username, "postgres.zfbiyyhedhqdgrxxajrj");
  assert.equal(poolerUrl.searchParams.get("sslmode"), "require");

  const direct = resolveAppDatabaseUrl({
    NODE_ENV: "development",
    POSTGRES_DATABASE_URL: "postgresql://postgres:s3cret@db.zfbiyyhedhqdgrxxajrj.supabase.co:5432/postgres",
  });
  const directUrl = new URL(direct);
  assert.equal(directUrl.hostname, "db.zfbiyyhedhqdgrxxajrj.supabase.co");
  assert.equal(directUrl.searchParams.get("sslmode"), "require");

  assert.equal(resolveAppDatabaseUrl({ NODE_ENV: "test" }), "file:./prisma/dev.db");
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

test("public health does not return prisma or connection text", () => {
  const src = readFileSync(new URL("../src/app/api/health/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /postgresError/);
  assert.doesNotMatch(src, /error\.message/);
  assert.doesNotMatch(src, /POSTGRES_DATABASE_URL/);
  assert.match(src, /logApiError/);
});

test("generate uses postgres outside the test contour", () => {
  assert.equal(resolveGenerateSchema({ NODE_ENV: "development" }), "prisma/schema.postgres.prisma");
  assert.equal(resolveGenerateSchema({ NODE_ENV: "production" }), "prisma/schema.postgres.prisma");
  assert.equal(resolveGenerateSchema({ NODE_ENV: "test" }), "prisma/schema.prisma");
  assert.equal(
    resolveGenerateSchema({ DATABASE_URL: "file:./prisma/dev.db", NODE_ENV: "development" }),
    "prisma/schema.postgres.prisma",
  );
});

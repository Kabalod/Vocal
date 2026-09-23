import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseTargetError, resolveAppDatabaseUrl } from "../src/lib/db-target";

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
  assert.equal(
    resolveAppDatabaseUrl({
      NODE_ENV: "development",
      POSTGRES_DATABASE_URL: "postgresql://postgres.zfbiyyhedhqdgrxxajrj@localhost/postgres",
    }),
    "postgresql://postgres.zfbiyyhedhqdgrxxajrj@localhost/postgres?sslmode=require",
  );
  assert.equal(
    resolveAppDatabaseUrl({ NODE_ENV: "test" }),
    "file:./prisma/dev.db",
  );
});

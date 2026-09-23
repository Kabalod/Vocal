import assert from "node:assert/strict";
import { test } from "node:test";
import { resolvePrismaSchema } from "../scripts/prisma-schema";

test("app contour always generates postgres client", () => {
  assert.equal(resolvePrismaSchema({ NODE_ENV: "development" }), "prisma/schema.postgres.prisma");
  assert.equal(resolvePrismaSchema({ NODE_ENV: "production" }), "prisma/schema.postgres.prisma");
  assert.equal(
    resolvePrismaSchema({ NODE_ENV: "development", DATABASE_URL: "file:./prisma/dev.db" }),
    "prisma/schema.postgres.prisma",
  );
  assert.equal(resolvePrismaSchema({}), "prisma/schema.postgres.prisma");
});

test("sqlite client is only for the test contour", () => {
  assert.equal(resolvePrismaSchema({ NODE_ENV: "test" }), "prisma/schema.prisma");
  assert.equal(
    resolvePrismaSchema({
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://localhost:5432/vocal",
    }),
    "prisma/schema.prisma",
  );
  assert.equal(
    resolvePrismaSchema({
      NODE_ENV: "test",
      VOCAL_PRISMA_SCHEMA: "prisma/schema.postgres.prisma",
    }),
    "prisma/schema.postgres.prisma",
  );
});

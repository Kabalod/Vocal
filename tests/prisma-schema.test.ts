import assert from "node:assert/strict";
import { test } from "node:test";
import { resolvePrismaSchema } from "../scripts/prisma-schema";

test("postinstall stays on sqlite unless DATABASE_URL is postgres", () => {
  assert.equal(resolvePrismaSchema({ DATABASE_URL: "file:./prisma/dev.db" }), "prisma/schema.prisma");
  assert.equal(resolvePrismaSchema({}), "prisma/schema.prisma");
  assert.equal(
    resolvePrismaSchema({ DATABASE_URL: "postgresql://localhost:5432/vocal" }),
    "prisma/schema.postgres.prisma",
  );
  assert.equal(
    resolvePrismaSchema({
      DATABASE_URL: "file:./prisma/dev.db",
      VOCAL_PRISMA_SCHEMA: "prisma/schema.postgres.prisma",
    }),
    "prisma/schema.postgres.prisma",
  );
});

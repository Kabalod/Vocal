import assert from "node:assert/strict";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";

test("regular user cannot write shared criteria", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
    (process.env as { NODE_ENV?: string }).NODE_ENV = "test";
  delete process.env.VOCAL_CRITERIA_ADMIN_USER_IDS;
  process.env.VOCAL_TEST_USER_ID = "user-b";
    t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
  });

  const { GET, PUT, POST } = await import("../src/app/api/criteria/route");
  const loaded = await GET();
  assert.equal(loaded.status, 200);
  const before = await prisma.criterion.findMany({ orderBy: { id: "asc" } });
  assert.ok(before.length > 0);
  const snapshot = before.map((row) => ({ id: row.id, enabled: row.enabled, weight: row.weight }));

  const put = await PUT(
    new Request("http://vocal.local/api/criteria", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        criteria: snapshot.map((row) => ({ ...row, enabled: false, weight: 5 })),
      }),
    }),
  );
  assert.equal(put.status, 403);
  const body = await put.json();
  assert.equal(body.code, "CRITERIA_READONLY");

  const reset = await POST();
  assert.equal(reset.status, 403);

  const after = await prisma.criterion.findMany({ orderBy: { id: "asc" } });
  assert.deepEqual(
    after.map((row) => ({ id: row.id, enabled: row.enabled, weight: row.weight })),
    snapshot,
  );
});

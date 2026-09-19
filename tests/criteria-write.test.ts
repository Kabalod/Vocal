import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function migrateDeploy(url: string) {
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
    shell: true,
  });
}

test("regular user cannot write shared criteria", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "vocal-criteria-"));
  const url = `file:${path.join(dir, "test.db").replace(/\\/g, "/")}`;
  process.env.DATABASE_URL = url;
  (process.env as { NODE_ENV?: string }).NODE_ENV = "test";
  delete process.env.VOCAL_CRITERIA_ADMIN_USER_IDS;
  process.env.VOCAL_TEST_USER_ID = "user-b";
  await resetPrismaClient();
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* windows lock */
    }
  });
  migrateDeploy(url);

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

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("every tests/*.test.ts is listed in scripts/test-postgres.cjs (live-model tests are in liveModelTests)", () => {
  const runner = readFileSync(path.join(repoRoot, "scripts/test-postgres.cjs"), "utf8");
  const listed = new Set([...runner.matchAll(/"(tests\/[^"]+\.test\.ts)"/g)].map((match) => match[1]));
  const onDisk = readdirSync(path.join(repoRoot, "tests"))
    .filter((name) => name.endsWith(".test.ts"))
    .map((name) => `tests/${name}`);
  const missing = onDisk.filter((file) => !listed.has(file));
  assert.deepEqual(missing, [], `Add to scripts/test-postgres.cjs (dbTests) or liveModelTests: ${missing.join(", ")}`);
});

test("live-model tests stay out of the default runner list", () => {
  const runner = readFileSync(path.join(repoRoot, "scripts/test-postgres.cjs"), "utf8");
  const dbBlock = runner.slice(runner.indexOf("const dbTests"), runner.indexOf("const reelsTests"));
  assert.equal(dbBlock.includes("c00-classify-live"), false);
  assert.equal(dbBlock.includes("c00-live-model"), false);
});

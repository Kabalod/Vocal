import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("thought dialogue skips C00 classifier model unless the author explicitly corrects a fact", () => {
  const dialogue = readFileSync(path.join(repoRoot, "src/lib/dialogue.ts"), "utf8");
  assert.match(dialogue, /isExplicitAuthorFactCorrection\(input\.userText\)/);
  assert.match(dialogue, /classifiedPromise/);
});

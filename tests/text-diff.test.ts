import assert from "node:assert/strict";
import { test } from "node:test";
import { DIFF_QUALITY_NOTE, diffTexts } from "../src/lib/text-diff";

test("diffTexts is deterministic and does not treat counts as quality", () => {
  const first = diffTexts("чай остыл на подоконнике", "чай остыл на столе");
  const second = diffTexts("чай остыл на подоконнике", "чай остыл на столе");
  assert.deepEqual(first, second);
  assert.equal(first.note, DIFF_QUALITY_NOTE);
  assert.equal(first.chunks.some((chunk) => chunk.op === "del" && chunk.text.includes("подоконнике")), true);
  assert.equal(first.chunks.some((chunk) => chunk.op === "add" && chunk.text.includes("столе")), true);
  assert.equal(first.addedTokens > 0, true);
});

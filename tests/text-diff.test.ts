import assert from "node:assert/strict";
import { test } from "node:test";
import { DIFF_QUALITY_NOTE, DIFF_TRUNCATED_NOTE, MAX_DIFF_CHARS, diffTexts } from "../src/lib/text-diff";

function fillText(length: number, seed: string): string {
  let text = "";
  let index = 0;
  while (text.length < length) {
    text += `${seed}${index} `;
    index += 1;
  }
  return text.slice(0, length);
}

test("diffTexts is deterministic and does not treat counts as quality", () => {
  const first = diffTexts("чай остыл на подоконнике", "чай остыл на столе");
  const second = diffTexts("чай остыл на подоконнике", "чай остыл на столе");
  assert.deepEqual(first, second);
  assert.equal(first.truncated, false);
  assert.equal(first.note, DIFF_QUALITY_NOTE);
  assert.equal(first.chunks.some((chunk) => chunk.op === "del" && chunk.text.includes("подоконнике")), true);
  assert.equal(first.chunks.some((chunk) => chunk.op === "add" && chunk.text.includes("столе")), true);
  assert.equal(first.addedTokens > 0, true);
});

test("diffTexts handles 20000-character sides without an n×m table and marks truncation", () => {
  const left = fillText(20000, "лев");
  const right = fillText(20000, "прав");
  assert.equal(left.length, 20000);
  assert.equal(right.length, 20000);
  const started = Date.now();
  const result = diffTexts(left, right);
  const elapsed = Date.now() - started;
  assert.equal(result.truncated, true);
  assert.equal(result.note.includes(DIFF_TRUNCATED_NOTE), true);
  assert.equal(left.length > MAX_DIFF_CHARS, true);
  assert.equal(elapsed < 2000, true, `diff too slow: ${elapsed}ms`);
});

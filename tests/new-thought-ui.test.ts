import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("new thought form is one text card with create, cancel, retry and no profile guard", () => {
  const sheet = readFileSync(join(root, "src/components/NewThoughtSheet.tsx"), "utf8");
  const list = readFileSync(join(root, "src/components/ReelList.tsx"), "utf8");
  assert.match(sheet, /title="Новая мысль"/);
  assert.match(sheet, /htmlFor=\{titleId\}/);
  assert.match(sheet, />Название</);
  assert.match(sheet, />Мысль</);
  assert.match(sheet, /Продолжить с Vocal/);
  assert.match(sheet, /Отмена/);
  assert.match(sheet, /Повторить/);
  assert.match(sheet, /\/api\/thoughts/);
  assert.match(sheet, /idempotencyKey/);
  assert.match(sheet, /inFlight\.current/);
  assert.match(sheet, /router\.push\(`\/reels\/\$\{id\}`\)/);
  assert.match(sheet, /router\.refresh\(\)/);
  assert.match(list, /NewThoughtSheet/);
  assert.equal(sheet.includes("profile"), false);
  assert.equal(sheet.includes("SegmentedTabs"), false);
  assert.equal(sheet.includes("ThoughtVoiceRecorder"), false);
  assert.equal(sheet.includes("ThoughtVideoUpload"), false);
  assert.equal(sheet.includes("/api/analyze"), false);
  assert.equal(sheet.includes("dialogue"), false);
});

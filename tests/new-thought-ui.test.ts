import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("new thought form is one card (mic, text, video) with create, cancel, retry and no profile guard with create, cancel, retry and no profile guard", () => {
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
  assert.equal(sheet.includes("router.refresh()"), false, "refresh right after push races the navigation");
  assert.match(list, /NewThoughtSheet/);
  assert.equal(sheet.includes("profile"), false);
  assert.equal(sheet.includes("SegmentedTabs"), false, "screen 04 has no Text|Voice|Video tabs");
  assert.equal(sheet.includes("/api/analyze"), false);
  assert.equal(sheet.includes("dialogue"), false);
});

test("new thought card enters voice and video only by explicit buttons and stops them on leave", () => {
  const sheet = readFileSync(join(root, "src/components/NewThoughtSheet.tsx"), "utf8");
  assert.match(sheet, /ThoughtVoiceRecorder/);
  assert.match(sheet, /ThoughtVideoUpload/);
  assert.match(sheet, /ThoughtMediaProcessing/);
  assert.match(sheet, /uploadThoughtMedia/);
  assert.match(sheet, /aria-label="Записать голосом"/);
  assert.match(sheet, /aria-label="Загрузить видео"/);
  // Nothing starts by itself: the recorder is mounted only after the mic button sets the mode.
  assert.match(sheet, /mode === "voice" \? \(/);
  assert.match(sheet, /setMode\("none"\)/);
  // Leaving aborts the upload and releases the microphone (2af98a2, 1611f27).
  assert.match(sheet, /syncThoughtUploadToSheetVisibility/);
  assert.match(sheet, /uploadRef\.current\?\.abort\(\)/);
  assert.match(sheet, /thoughtLeaveKind/);
  assert.equal(sheet.includes("/api/analyze"), false);
});

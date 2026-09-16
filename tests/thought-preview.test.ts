import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  pickThoughtPreviewFragment,
  resetThoughtListQuery,
  thoughtUserStatus,
} from "../src/lib/thought-preview";
import { reelStatusGroup } from "../src/types/reel";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("in_progress and ready_to_record share the same user status icon", () => {
  assert.equal(thoughtUserStatus("in_progress"), "in_progress");
  assert.equal(thoughtUserStatus("ready_to_record"), "in_progress");
  assert.equal(thoughtUserStatus(reelStatusGroup("in_progress")), thoughtUserStatus(reelStatusGroup("ready_to_record")));
  const card = readFileSync(join(root, "src/components/ReelCard.tsx"), "utf8");
  assert.match(card, /thoughtUserStatus\(reel\.statusGroup\)/);
  assert.match(card, /StatusBadge/);
  assert.match(card, /href=\{\`\/reels\/\$\{reel\.id\}\`\}/);
  assert.equal(card.includes("ReelStatusIcon"), false);
  assert.equal(card.includes("дублей"), false);
  assert.equal(card.includes("matchMedia"), false);
});

test("desktop preview prefers a ready script over the original note", () => {
  const note = "исходная мысль пользователя";
  const picked = pickThoughtPreviewFragment({
    initialNote: note,
    finalScriptId: "final-1",
    selectedScriptId: "sel-1",
    versions: [
      { id: "sel-1", kind: "manual", body: "выбранный сценарий" },
      { id: "final-1", kind: "manual", body: "итоговый сценарий для превью" },
    ],
  });
  assert.equal(picked.source, "script");
  assert.equal(picked.text, "итоговый сценарий для превью");
  assert.equal(picked.text.includes(note), false);

  const selectedOnly = pickThoughtPreviewFragment({
    initialNote: note,
    finalScriptId: null,
    selectedScriptId: "sel-1",
    versions: [{ id: "sel-1", kind: "manual", body: "выбранный сценарий" }],
  });
  assert.equal(selectedOnly.text, "выбранный сценарий");

  const latestReady = pickThoughtPreviewFragment({
    initialNote: note,
    finalScriptId: null,
    selectedScriptId: null,
    versions: [
      { id: "prop", kind: "ai_proposal", body: "черновик модели" },
      { id: "ready", kind: "manual", body: "последняя готовая версия" },
    ],
  });
  assert.equal(latestReady.text, "последняя готовая версия");

  const fallback = pickThoughtPreviewFragment({
    initialNote: note,
    finalScriptId: null,
    selectedScriptId: null,
    versions: [],
  });
  assert.equal(fallback.source, "note");
  assert.equal(fallback.text, note);
});

test("reset clears search and filter together without AI", () => {
  assert.deepEqual(resetThoughtListQuery(), { q: "", status: "all" });
  const list = readFileSync(join(root, "src/components/ReelList.tsx"), "utf8");
  assert.match(list, /Сбросить поиск и фильтры/);
  assert.match(list, /resetThoughtListQuery/);
  assert.equal(list.includes("/api/analyze"), false);
  assert.equal(list.includes("groq"), false);
});

test("thought list states stay on the real API and do not require a profile", () => {
  const list = readFileSync(join(root, "src/components/ReelList.tsx"), "utf8");
  const card = readFileSync(join(root, "src/components/ReelCard.tsx"), "utf8");
  assert.match(list, /fetch\(`\/api\/reels\?\$\{queryString\}`/);
  assert.match(list, /ShellLoading/);
  assert.match(list, /Пока нет мыслей/);
  assert.match(list, /ShellError/);
  assert.match(list, /onRetry/);
  assert.match(list, /Новая мысль/);
  assert.equal(list.includes("profile"), false);
  assert.equal(list.includes("demo"), false);
  assert.equal(list.includes("MOCK"), false);
  assert.equal(list.includes("selectedId"), false);
  assert.equal(card.includes("Идея"), false);
  assert.equal(card.includes("Готов к записи"), false);
  assert.equal(card.includes("Архив"), false);
});

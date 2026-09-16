import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { R8_VIEWPORTS, TOUCH_TARGET_MIN_PX } from "../src/lib/a11y-contracts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

test("P17 visual: tokens, Inter/Literata/Caveat, reduced motion, viewports", () => {
  const css = src("src/app/globals.css");
  const layout = src("src/app/layout.tsx");
  assert.match(css, /--accent:\s*#8b7cff/);
  assert.match(css, /--font-sans:\s*var\(--font-inter\)/);
  assert.match(css, /--font-display:\s*var\(--font-literata\)/);
  assert.match(css, /\.polaroid/);
  assert.match(css, /\.polaroid-caption/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /\.recording-script/);
  assert.match(css, /\.dialogue-script/);
  assert.match(layout, /Inter/);
  assert.match(layout, /Literata/);
  assert.match(layout, /Caveat/);
  assert.match(layout, /--font-caveat/);
  assert.deepEqual([...R8_VIEWPORTS], [320, 360, 390, 1024, 1280]);
  assert.equal(TOUCH_TARGET_MIN_PX, 44);
});

test("P17 visual: recording teleprompter, dialogue split, polaroid path, thoughts sidebar", () => {
  const recording = src("src/components/RecordingView.tsx");
  const dialogue = src("src/components/ThoughtDialogue.tsx");
  const takes = src("src/components/TakeList.tsx");
  const list = src("src/components/ReelList.tsx");
  const script = src("src/components/ScriptEditor.tsx");
  const studio = src("src/components/ReelStudio.tsx");

  assert.match(recording, /Начать запись/);
  assert.match(recording, /recording-script/);
  assert.match(recording, /minmax\(15rem,20rem\)/);
  assert.match(recording, /Скрыть сценарий/);
  assert.doesNotMatch(recording, /ThoughtDialogue/);
  assert.doesNotMatch(recording, /Composer/);

  assert.match(dialogue, /dialogue-script/);
  assert.match(dialogue, /23\.75rem/);
  assert.match(dialogue, /bg-surface-raised/);
  assert.match(dialogue, /Composer/);
  assert.doesNotMatch(dialogue, /#201D18/);

  assert.match(takes, /polaroid/);
  assert.match(takes, /take-path/);
  assert.match(takes, /От последнего/);
  assert.match(takes, /min-h-11/);
  assert.match(takes, /aria-label=\{`Заметка к дублю/);

  assert.match(list, /aria-label="Поиск и фильтры"/);
  assert.match(list, /shell:grid-cols-\[minmax\(12rem,16rem\)/);
  assert.match(script, /Редактировать/);
  assert.match(studio, /AutoTakeCompare/);
  assert.doesNotMatch(studio, /TakeComparison/);
});

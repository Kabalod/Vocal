import "./helpers/react-global";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { KEYBOARD_OPEN_THRESHOLD, keyboardInset } from "../src/components/use-keyboard-inset";
import { focusTakeId, timelineNodes } from "../src/components/takes-path";
import type { TakeDto } from "../src/types/reel";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

function take(number: number): TakeDto {
  return {
    id: `t${number}`,
    reelId: "r1",
    number,
    inputType: "audio",
    authorNote: "",
    mediaStatus: "ready",
    originalName: null,
    mimeType: "audio/webm",
    bodyText: "",
    hasFile: true,
    browserPlayback: true,
    mediaUrl: null,
    downloadUrl: null,
    scriptVersionId: null,
  } as unknown as TakeDto;
}

test("keyboardInset: what is missing under the visual viewport; never negative", () => {
  assert.equal(keyboardInset(844, 844, 0), 0);
  assert.equal(keyboardInset(844, 508, 0), 336);
  assert.equal(keyboardInset(844, 508, 20), 316);
  assert.equal(keyboardInset(844, 900, 0), 0);
  assert.ok(KEYBOARD_OPEN_THRESHOLD >= 60);
});

test("focus card: the final take, else the newest; a picked take wins; a removed one falls back", () => {
  const takes = [take(1), take(2), take(3)];
  assert.equal(focusTakeId(takes, null, null), "t3");
  assert.equal(focusTakeId(takes, "t1", null), "t1");
  assert.equal(focusTakeId(takes, "t1", "t2"), "t2");
  assert.equal(focusTakeId(takes, "t1", "gone"), "t1");
  assert.equal(focusTakeId([], null, null), null);
});

test("timeline: everything but the focused take, the ghost at the newest end", () => {
  const takes = [take(1), take(2), take(3)];
  assert.deepEqual(timelineNodes(takes, "newest", "t3").map((node) => node?.id ?? "ghost"), ["ghost", "t2", "t1"]);
  assert.deepEqual(timelineNodes(takes, "oldest", "t1").map((node) => node?.id ?? "ghost"), ["t2", "t3", "ghost"]);
  assert.deepEqual(timelineNodes([], "newest", null).map((node) => node?.id ?? "ghost"), ["ghost"]);
});

test("wiring: nav bar with collapsing title, keyboard inset, bottom bar, sheets and safe areas", () => {
  const frame = read("src/components/ReelStudioFrame.tsx");
  assert.match(frame, /IosNavBar/);
  assert.match(frame, /IntersectionObserver/);
  assert.match(frame, /SegmentedTabs/);
  assert.match(frame, /ActionSheet/);
  assert.match(frame, /DeleteThoughtConfirm/);
  const shell = read("src/components/VocalAppShell.tsx");
  assert.match(shell, /useKeyboardInset\(\)/);
  assert.match(shell, /safe-area-inset-bottom/);
  const css = read("src/app/globals.css");
  assert.match(css, /data-kb-open/);
  assert.match(css, /hover: none/);
  const script = read("src/components/ScriptEditor.tsx");
  assert.match(script, /data-script-actionbar/);
  const dialogue = read("src/components/ThoughtDialogue.tsx");
  assert.match(dialogue, /data-dialogue-touch/);
  const takes = read("src/components/TakesPathMobile.tsx");
  for (const name of ["Слушать", "Читать", "Видео", "Сделать итоговым", "Следующий дубль", "итоговый", "от последнего", "от первого"]) {
    assert.ok(takes.includes(name), name);
  }
  assert.doesNotMatch(takes, /pathSlot|pathSegments|pathHeight/, "no zig-zag on the touch path");
  assert.doesNotMatch(takes, /runAi|\/compare"/, "no manual comparison on the touch path");
});

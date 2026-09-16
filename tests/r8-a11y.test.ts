import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { nextTabIndex } from "../src/components/vocal-ui/segmented-tabs";
import { nextSheetFocusIndex, shouldCycleSheetTab } from "../src/components/shell-sheet";
import {
  AICALL_PROMPT_TEXT_IN_DB_ALLOWED,
  R8_KEY_ROUTES,
  R8_VIEWPORTS,
  TOUCH_TARGET_MIN_PX,
} from "../src/lib/a11y-contracts";
import { P13_P16_TO_R_PHASE } from "../src/lib/product-contracts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

test("P15 maps to R5+R8 and adaptive smoke viewports cover key routes", () => {
  assert.equal(P13_P16_TO_R_PHASE.P15, "R5+R8");
  assert.deepEqual([...R8_VIEWPORTS], [320, 360, 390, 1024, 1280]);
  assert.deepEqual([...R8_KEY_ROUTES], ["/reels", "/reels/[id]", "/profile"]);
  assert.equal(TOUCH_TARGET_MIN_PX, 44);
  assert.equal(AICALL_PROMPT_TEXT_IN_DB_ALLOWED, true);
});

test("studio tabs wrap with arrows and do not use horizontal auto-scroll", () => {
  assert.equal(nextTabIndex(0, 3, "ArrowRight"), 1);
  assert.equal(nextTabIndex(2, 3, "ArrowRight"), 0);
  assert.equal(nextTabIndex(0, 3, "ArrowLeft"), 2);
  assert.equal(nextTabIndex(1, 3, "Home"), 0);
  assert.equal(nextTabIndex(0, 3, "End"), 2);
  const tabs = src("src/components/vocal-ui/SegmentedTabs.tsx");
  assert.match(tabs, /role="tablist"/);
  assert.match(tabs, /flex-wrap/);
  assert.match(tabs, /min-h-11/);
  const frame = src("src/components/ReelStudioFrame.tsx");
  assert.match(frame, /overflow-x-hidden/);
  assert.doesNotMatch(frame, /overflow-x-auto/);
  assert.match(frame, /aria-label="Разделы мысли"/);
});

test("composer, new thought, export, and icon-only controls expose names and 44px targets", () => {
  const composer = src("src/components/vocal-ui/Composer.tsx");
  assert.match(composer, /Сообщение/);
  assert.match(composer, /micLabel = "Записать голос"/);
  assert.match(composer, /label=\{micLabel\}/);
  assert.match(composer, /min-h-11/);
  const icon = src("src/components/vocal-ui/IconButton.tsx");
  assert.match(icon, /aria-label=\{label\}/);
  assert.match(icon, /h-11 w-11/);
  const modal = src("src/components/vocal-ui/VocalModal.tsx");
  assert.match(modal, /label="Закрыть"/);
  assert.match(modal, /Escape/);
  assert.match(modal, /triggerRef\.current\?\.focus\(\)/);
  const thought = src("src/components/NewThoughtSheet.tsx");
  assert.match(thought, /htmlFor=\{titleId\}/);
  assert.match(thought, /htmlFor=\{bodyId\}/);
  assert.match(thought, /VocalModal/);
  const exportUi = src("src/components/CanonicalExportActions.tsx");
  assert.match(exportUi, /Текст для ручного копирования/);
  assert.match(exportUi, /Копировать/);
  assert.match(exportUi, /Скачать \.txt/);
  const action = src("src/components/vocal-ui/ActionButton.tsx");
  assert.match(action, /min-h-11 min-w-11/);
  const shell = src("src/components/VocalAppShell.tsx");
  assert.match(shell, /aria-label=\{`Назад: \$\{back\.label\}`\}/);
  assert.match(shell, /overflow-x-hidden/);
  assert.match(shell, /Escape/);
  assert.match(shell, /menuButtonRef\.current\?\.focus\(\)/);
});

test("sheet/dialog tab trap wraps; layout forbids page-level horizontal overflow", () => {
  assert.equal(shouldCycleSheetTab(2, 3, false), true);
  assert.equal(nextSheetFocusIndex(2, 3, false), 0);
  const css = src("src/app/globals.css");
  assert.match(css, /overflow-x:\s*hidden/);
  assert.match(css, /min-width:\s*320px/);
  const layout = src("src/app/layout.tsx");
  assert.match(layout, /overflow-x-hidden/);
  const profile = src("src/app/profile/page.tsx");
  assert.match(profile, /break-words/);
});

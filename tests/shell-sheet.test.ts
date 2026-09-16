import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { nextSheetFocusIndex, shouldCycleSheetTab, trapSheetTab } from "../src/components/shell-sheet";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("sheet tab wraps from last to first and from first to last", () => {
  assert.equal(shouldCycleSheetTab(0, 3, true), true);
  assert.equal(shouldCycleSheetTab(0, 3, false), false);
  assert.equal(shouldCycleSheetTab(2, 3, false), true);
  assert.equal(shouldCycleSheetTab(1, 3, false), false);
  assert.equal(nextSheetFocusIndex(2, 3, false), 0);
  assert.equal(nextSheetFocusIndex(0, 3, true), 2);
  assert.equal(nextSheetFocusIndex(-1, 3, false), 0);
  assert.equal(shouldCycleSheetTab(-1, 3, false), true);
});

test("trapSheetTab always moves focus and wraps at the edges", () => {
  const focused: string[] = [];
  const items = ["close", "reels", "profile"].map((name) => ({
    name,
    tabIndex: 0,
    hidden: false,
    hasAttribute() {
      return false;
    },
    getAttribute() {
      return null;
    },
    focus() {
      focused.push(name);
    },
  }));
  const rootNode = {
    querySelectorAll() {
      return items;
    },
  } as unknown as ParentNode;
  const event = {
    key: "Tab",
    shiftKey: false,
    preventDefault() {},
  };
  assert.equal(trapSheetTab(event, rootNode, items[0] as unknown as Element), true);
  assert.equal(trapSheetTab({ ...event, shiftKey: false }, rootNode, items[2] as unknown as Element), true);
  assert.equal(trapSheetTab({ ...event, shiftKey: true }, rootNode, items[0] as unknown as Element), true);
  assert.deepEqual(focused, ["reels", "close", "profile"]);
});

test("mobile sheet keeps backdrop out of tab order and restores menu focus", () => {
  const shell = readFileSync(join(root, "src/components/VocalAppShell.tsx"), "utf8");
  assert.match(shell, /menuButtonRef/);
  assert.match(shell, /sheetPanelRef/);
  assert.match(shell, /trapSheetTab/);
  assert.match(shell, /menuButtonRef\.current\?\.focus\(\)/);
  assert.match(shell, /tabIndex=\{-1\}/);
  assert.match(shell, /aria-hidden="true"/);
  assert.equal(/aria-label="Закрыть меню"/.test(shell), false);
  assert.match(shell, /document\.body\.style\.overflow = previousOverflow/);
  assert.match(shell, /removeEventListener\("keydown"/);
});

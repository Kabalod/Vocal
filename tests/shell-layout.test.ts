import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  parseShellCollapsed,
  SHELL_COLLAPSED_STORAGE_KEY,
  SHELL_DESKTOP_MEDIA,
  SHELL_DESKTOP_MIN_PX,
  SHELL_SIDEBAR_COLLAPSED_PX,
  SHELL_SIDEBAR_EXPANDED_PX,
  subscribeShellCollapsed,
  writeStoredShellCollapsed,
} from "../src/components/shell-layout";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("shell layout tokens match UI_SPEC breakpoints and sidebar widths", () => {
  assert.equal(SHELL_DESKTOP_MIN_PX, 1200);
  assert.equal(SHELL_SIDEBAR_EXPANDED_PX, 200);
  assert.equal(SHELL_SIDEBAR_COLLAPSED_PX, 64);
  assert.equal(SHELL_DESKTOP_MEDIA, "(min-width: 1200px)");
  assert.equal(SHELL_COLLAPSED_STORAGE_KEY, "vocal-shell-collapsed");
  assert.equal(parseShellCollapsed(null), false);
  assert.equal(parseShellCollapsed("0"), false);
  assert.equal(parseShellCollapsed("1"), true);
  assert.equal(parseShellCollapsed("true"), true);
});

test("shell uses 1200px breakpoint and persists collapse, not md sidebar", () => {
  const css = readFileSync(join(root, "src/app/globals.css"), "utf8");
  const shell = readFileSync(join(root, "src/components/VocalAppShell.tsx"), "utf8");
  assert.match(css, /--breakpoint-shell:\s*75rem/);
  assert.match(css, /--vocal-accent:\s*#d4a574/);
  assert.match(css, /--vocal-on-accent:\s*#241a10/);
  assert.match(css, /--vocal-focus:\s*#f0cd9d/);
  assert.match(shell, /shell:flex/);
  assert.match(shell, /shell:!hidden/);
  assert.match(shell, /w-\[200px\]/);
  assert.match(shell, /w-16/);
  assert.match(shell, /writeStoredShellCollapsed/);
  assert.equal(shell.includes("md:flex"), false);
  assert.equal(shell.includes("md:hidden"), false);
});

test("writeStoredShellCollapsed notifies in-process subscribers", () => {
  let calls = 0;
  const unsubscribe = subscribeShellCollapsed(() => {
    calls += 1;
  });
  writeStoredShellCollapsed(true);
  unsubscribe();
  assert.equal(calls, 1);
});

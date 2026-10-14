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
  const layout = readFileSync(join(root, "src/app/layout.tsx"), "utf8");
  assert.match(css, /--breakpoint-shell:\s*75rem/);
  assert.match(layout, /Inter/);
  assert.match(layout, /Literata/);
  assert.match(layout, /--font-inter/);
  assert.match(layout, /--font-literata/);
  assert.match(css, /--vocal-accent:\s*var\(--accent\)/);
  // P1: prototype palette (accent for fills without text, white text on the button gradient, no violet glow)
  assert.match(css, /--accent:\s*#8b6cf8/);
  assert.match(css, /--accent-soft:\s*#a28bfb/);
  assert.match(css, /--bg:\s*#131315/);
  assert.match(css, /--on-accent:\s*#ffffff/);
  assert.match(css, /--radius-panel:\s*14px/);
  assert.match(css, /--radius-control:\s*12px/);
  assert.match(css, /--shadow-primary:\s*inset 0 0\.5px 0 rgba\(255, 255, 255, 0\.25\), 0 1px 2px rgba\(0, 0, 0, 0\.4\)/);
  assert.equal(/--shadow-primary:[^;]*139, 124, 255/.test(css), false);
  assert.match(shell, /shell:flex/);
  assert.match(shell, /shell:!hidden/);
  assert.match(shell, /w-\[200px\]/);
  assert.match(shell, /w-16/);
  assert.match(shell, /writeStoredShellCollapsed/);
  assert.match(shell, /Главные разделы/);
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

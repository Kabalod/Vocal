import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { STUDIO_MOBILE_TABS, isStudioMobileTab, parseStudioTab, studioThoughtHref } from "../src/components/reel-studio";
import { resolveStudioRecordDeepLink, studioRecordGate } from "../src/lib/recording-session";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("studio IA is three thought tabs with a URL tab param", () => {
  assert.deepEqual(
    STUDIO_MOBILE_TABS.map((item) => item.label),
    ["Дубли", "Диалог", "Сценарий"],
  );
  assert.equal(isStudioMobileTab("dialog"), true);
  assert.equal(isStudioMobileTab("compare"), false);
  assert.equal(parseStudioTab("script"), "script");
  assert.equal(parseStudioTab("nope"), "takes");
  assert.equal(studioThoughtHref("abc", "dialog"), "/reels/abc?tab=dialog");
});

test("record opens a new voice take even without a ready script", () => {
  assert.equal(studioRecordGate({ hasReadyScript: true, hasDraft: false }), "ok");
  assert.equal(studioRecordGate({ hasReadyScript: false, hasDraft: false }), "ok");
  assert.equal(
    resolveStudioRecordDeepLink({ thoughtCompleted: true, hasReadyScript: false, hasDraft: false }),
    "blocked",
  );
});

test("thought studio shell loads by id with back, tabs and honest missing/error", () => {
  const studio = readFileSync(join(root, "src/components/ReelStudio.tsx"), "utf8");
  const frame = readFileSync(join(root, "src/components/ReelStudioFrame.tsx"), "utf8");
  const page = readFileSync(join(root, "src/app/reels/[id]/page.tsx"), "utf8");
  const nav = readFileSync(join(root, "src/components/shell-nav.ts"), "utf8");
  assert.match(studio, /\/api\/reels\/\$\{reelId\}/);
  assert.match(studio, /Мысль не найдена/);
  assert.match(studio, /ShellError/);
  assert.match(studio, /studioThoughtHref/);
  assert.match(studio, /ThoughtStudioHeader/);
  assert.match(frame, /STUDIO_TABS/);
  assert.match(frame, /aria-label="Разделы мысли"/);
  assert.match(page, /Suspense/);
  assert.match(nav, /href: "\/reels", label: "Мысли"/);
  assert.equal(studio.includes("demo"), false);
  assert.match(studio, /tab === "dialog" && !recording/);
  assert.match(studio, /tab === "script" && !recording/);
  assert.equal(studio.includes("TakeComparison"), false);
  assert.equal(frame.includes("hidden={tab"), false);
});

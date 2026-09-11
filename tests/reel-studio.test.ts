import assert from "node:assert/strict";
import { test } from "node:test";
import { STUDIO_MATERIAL_TABS, STUDIO_MOBILE_TABS, isStudioMobileTab } from "../src/components/reel-studio";

test("studio IA is takes/script on desktop and three mobile tabs", () => {
  assert.deepEqual(
    STUDIO_MATERIAL_TABS.map((item) => item.label),
    ["Дубли", "Сценарий"],
  );
  assert.deepEqual(
    STUDIO_MOBILE_TABS.map((item) => item.label),
    ["Дубли", "Сценарий", "Диалог"],
  );
  assert.equal(isStudioMobileTab("dialog"), true);
  assert.equal(isStudioMobileTab("compare"), false);
});

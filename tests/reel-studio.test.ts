import assert from "node:assert/strict";
import { test } from "node:test";
import { STUDIO_PANELS } from "../src/components/reel-studio";

test("studio secondary panels stay inside the recording", () => {
  assert.deepEqual(
    STUDIO_PANELS.map((item) => item.label),
    ["Vocal", "Дубли", "Контекст", "Сравнение"],
  );
  assert.equal(
    STUDIO_PANELS.some((item) => item.id === "vocal"),
    true,
  );
});

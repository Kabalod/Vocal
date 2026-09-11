import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  timelineIndex,
  timelineNeighbor,
  timelineTickGapClass,
  timelineTickStates,
  timelineValueText,
  timelineVersions,
} from "../src/components/script-timeline";

function versions(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `v${i}`,
    createdAt: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
  }));
}

test("script timeline is chronological and does not cap version count", () => {
  const list = [
    { id: "c", createdAt: "2026-09-03T00:00:00.000Z" },
    { id: "a", createdAt: "2026-09-01T00:00:00.000Z" },
    { id: "b", createdAt: "2026-09-02T00:00:00.000Z" },
  ];
  assert.deepEqual(
    timelineVersions(list).map((row) => row.id),
    ["a", "b", "c"],
  );
  assert.equal(timelineIndex(list, "b"), 1);
  assert.equal(timelineNeighbor(list, "b", -1), "a");
  assert.equal(timelineNeighbor(list, "b", 1), "c");
  assert.equal(timelineNeighbor(list, "a", -1), null);
});

test("timeline markup contract keeps a tick for 1, 2, 20 and 40 versions", () => {
  for (const count of [1, 2, 20, 40]) {
    const list = versions(count);
    const ticks = timelineTickStates(list, list[0].id, list[0].id, null);
    assert.equal(ticks.length, count);
    assert.equal(ticks.filter((tick) => tick.viewing).length, 1);
  }
  const one = versions(1);
  assert.equal(timelineNeighbor(one, "v0", -1), null);
  assert.equal(timelineNeighbor(one, "v0", 1), null);
  assert.equal(timelineValueText({ index: 0, total: 1, isHead: true, isFinal: false }), "Версия 1 из 1, активная");

  const two = versions(2);
  assert.equal(timelineNeighbor(two, "v0", 1), "v1");
  assert.equal(timelineNeighbor(two, "v1", -1), "v0");

  const forty = versions(40);
  const ticks = timelineTickStates(forty, "v6", "v39", "v6");
  assert.equal(ticks.length, 40);
  assert.equal(ticks[6].viewing, true);
  assert.equal(ticks[6].final, true);
  assert.equal(ticks[39].head, true);
  assert.equal(ticks[39].viewing, false);
  assert.equal(
    timelineValueText({ index: 6, total: 40, isHead: false, isFinal: true }),
    "Версия 7 из 40, финальная",
  );
  assert.equal(timelineTickGapClass(20), "gap-0.5");
  assert.equal(timelineTickGapClass(40), "gap-px");
});

test("timeline component markup uses spans for every tick and no version cap", () => {
  const src = readFileSync(new URL("../src/components/ScriptVersionTimeline.tsx", import.meta.url), "utf8");
  assert.equal(src.includes("list.length <= 24"), false);
  assert.equal(src.includes("число не ограничено"), false);
  assert.match(src, /<span key=\{tick\.id\}/);
  assert.equal(src.includes("data-timeline-tick"), true);
  assert.equal(/aria-hidden[\s\S]*<button/.test(src), false);
});

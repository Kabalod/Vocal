import assert from "node:assert/strict";
import { test } from "node:test";
import { timelineIndex, timelineNeighbor, timelineVersions } from "../src/components/script-timeline";

test("script timeline is chronological and does not cap version count", () => {
  const versions = [
    { id: "c", createdAt: "2026-09-03T00:00:00.000Z" },
    { id: "a", createdAt: "2026-09-01T00:00:00.000Z" },
    { id: "b", createdAt: "2026-09-02T00:00:00.000Z" },
  ];
  assert.deepEqual(
    timelineVersions(versions).map((row) => row.id),
    ["a", "b", "c"],
  );
  assert.equal(timelineIndex(versions, "b"), 1);
  assert.equal(timelineNeighbor(versions, "b", -1), "a");
  assert.equal(timelineNeighbor(versions, "b", 1), "c");
  assert.equal(timelineNeighbor(versions, "a", -1), null);
  const many = Array.from({ length: 40 }, (_, i) => ({
    id: `v${i}`,
    createdAt: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
  }));
  assert.equal(timelineVersions(many).length, 40);
  assert.equal(timelineIndex(many, "v39"), 39);
});

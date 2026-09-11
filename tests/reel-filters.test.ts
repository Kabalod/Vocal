import assert from "node:assert/strict";
import { test } from "node:test";
import { RECORDING_FILTERS, isRecordingFilterId } from "../src/components/reel-filters";
import { reelStatusGroup } from "../src/types/reel";

test("thought filters are the four user groups without archive chips", () => {
  assert.deepEqual(
    RECORDING_FILTERS.map((item) => item.id),
    ["all", "idea", "in_progress", "completed"],
  );
  assert.deepEqual(
    RECORDING_FILTERS.map((item) => item.label),
    ["Все", "Не завершена", "В работе", "Успешно завершена"],
  );
  assert.equal(isRecordingFilterId("archived"), false);
  assert.equal(isRecordingFilterId("open"), false);
  assert.equal(isRecordingFilterId("ready_to_record"), false);
});

test("internal reel statuses map to user groups", () => {
  assert.equal(reelStatusGroup("idea"), "open");
  assert.equal(reelStatusGroup("in_progress"), "in_progress");
  assert.equal(reelStatusGroup("ready_to_record"), "in_progress");
  assert.equal(reelStatusGroup("completed"), "completed");
  assert.equal(reelStatusGroup("archived"), "archived");
});

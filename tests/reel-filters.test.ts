import assert from "node:assert/strict";
import { test } from "node:test";
import { MORE_RECORDING_FILTERS, RECORDING_FILTERS } from "../src/components/reel-filters";

test("recording filters keep existing API ids and visual labels", () => {
  assert.deepEqual(
    RECORDING_FILTERS.map((item) => item.id),
    ["all", "open", "in_progress", "completed"],
  );
  assert.deepEqual(
    RECORDING_FILTERS.map((item) => item.label),
    ["Все", "Не завершена", "В работе", "Успешно завершена"],
  );
  assert.equal(
    MORE_RECORDING_FILTERS.some((item) => item.id === "archived"),
    true,
  );
});

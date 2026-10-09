import assert from "node:assert/strict";
import { test } from "node:test";
import { isSubstantiveAnswer, speechWords, wordCount } from "../src/lib/turn-policy";
import { EMPTY_LONG, REAL_LONG } from "../scripts/r-live/substantive_eval";

test("E6: the 11-word threshold applies to meaningful words, not raw words", () => {
  const filler = "ну как бы да ну короче это так и есть ну типа как бы я так и думаю ну вот";
  assert.ok(wordCount(filler) > 11 && speechWords(filler) <= 11);
  assert.equal(isSubstantiveAnswer(filler), false, "a long answer made of fillers is not material");
  const real = "ну как бы я вышел на улицу и там было очень тихо только дворник мёл листья и я подумал что вот так бы и жить без спешки";
  assert.equal(isSubstantiveAnswer(real, "Что было дальше?"), true);
});

test("E6: restating the question and filler streams are not material; generic long speech still is (documented risk)", () => {
  const verdicts = EMPTY_LONG.map((item) => ({ kind: item.kind, material: isSubstantiveAnswer(item.answer, item.question) }));
  assert.equal(verdicts.filter((v) => v.material && v.kind !== "generic words").length, 0, "fillers, restated questions and self-repeats never pass");
  assert.equal(verdicts.filter((v) => v.material).length, 3, "the three generic-word answers still pass: the known residual risk");
  assert.equal(REAL_LONG.every((item) => isSubstantiveAnswer(item.answer, item.question)), true);
});

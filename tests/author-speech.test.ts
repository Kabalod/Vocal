import assert from "node:assert/strict";
import { test } from "node:test";
import { meaningfulWords, newContentWords, removeFillers, stripServiceMarks } from "../src/lib/author-speech";

test("E5: service markers are cut from author text", () => {
  assert.equal(stripServiceMarks("Я встаю в шесть утра по вторникам (факт 2), когда ещё темно."), "Я встаю в шесть утра по вторникам, когда ещё темно.");
  assert.equal(stripServiceMarks("Это важно (пункт 4)."), "Это важно.");
  assert.equal(stripServiceMarks("Саша в пункте 6 даже сказал"), "Саша в пункте 6 даже сказал", "ordinary words are untouched");
  assert.equal(stripServiceMarks("так было [факт 3, 5] и всё"), "так было и всё");
  assert.equal(stripServiceMarks("Я купил 3 яблока и факт 5"), "Я купил 3 яблока и");
  assert.equal(stripServiceMarks("Обычный текст."), "Обычный текст.");
});

test("E7: fillers and self-repeats are cut; the author's words stay", () => {
  assert.equal(removeFillers("ну как бы я вышел"), "Я вышел", "start");
  assert.equal(removeFillers("Ну, как бы я вышел"), "Я вышел");
  assert.equal(removeFillers("я вышел ну как бы на улицу"), "я вышел на улицу", "middle: the author's own capitals and lower case are left alone");
  assert.equal(removeFillers("я вышел на улицу короче"), "я вышел на улицу", "end");
  assert.equal(removeFillers("я вышел на улицу, короче."), "я вышел на улицу.", "end with a full stop");
  assert.equal(removeFillers("я я вышел"), "я вышел", "a word said twice");
  assert.equal(removeFillers("мы пошли в парк мы пошли в парк потом домой"), "мы пошли в парк потом домой", "a phrase said twice");
  assert.equal(removeFillers("это было типа очень давно"), "это было очень давно");
  assert.equal(removeFillers("э-э я думаю эм что да"), "Я думаю что да");
  assert.equal(removeFillers("Мне было вот так грустно"), "Мне было вот так грустно", "'вот' is ambiguous and stays");
  assert.equal(removeFillers("Это нормально, ну да. Потом я ушёл."), "Это нормально, да. Потом я ушёл.");
});

test("E6: meaningful words are counted after cutting fillers and repeats", () => {
  assert.deepEqual(meaningfulWords("ну как бы я я вышел короче"), ["я", "вышел"]);
  assert.equal(meaningfulWords("ну ну ну как бы типа короче э-э вот так вот").length <= 4, true);
  assert.equal(newContentWords("Что вы чувствовали, когда вышли на улицу утром?", "Что вы чувствовали?") >= 2, true);
  assert.equal(newContentWords("что я чувствовал я чувствовал что чувствовал", "Что вы чувствовали?") <= 2, true, "restating the question adds little");
});

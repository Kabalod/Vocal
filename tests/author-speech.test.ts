import assert from "node:assert/strict";
import { test } from "node:test";
import { meaningfulWords, newContentWords, normalizeTranscript, removeFillers, stripServiceMarks } from "../src/lib/author-speech";

test("E5 (narrowed by H9): the exact form (факт N) is cut from author text", () => {
  assert.equal(stripServiceMarks("Я встаю в шесть утра по вторникам (факт 2), когда ещё темно."), "Я встаю в шесть утра по вторникам, когда ещё темно.");
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

test("H2: a transcript is normalized: fillers and repeats out, sentence boundaries and capitals back, words unchanged", () => {
  const raw = "ну как бы я я вышел на улицу и там было очень тихо потом я пошёл домой и лёг спать короче а утром всё повторилось";
  assert.equal(
    normalizeTranscript(raw),
    "Я вышел на улицу и там было очень тихо. Потом я пошёл домой и лёг спать а утром всё повторилось.",
  );
  assert.equal(normalizeTranscript("Уже с пунктуацией. Всё как надо."), "Уже с пунктуацией. Всё как надо.", "punctuated text is left alone");
  assert.equal(normalizeTranscript(""), "");
  assert.equal(normalizeTranscript("(факт 2) да"), "Да.");
});

test("H9: only the exact form (факт N) is cut", () => {
  assert.equal(stripServiceMarks("Это важно (факт 2) и точка."), "Это важно и точка.");
  assert.equal(stripServiceMarks("пункт 3"), "пункт 3");
  assert.equal(stripServiceMarks("в третьем пункте"), "в третьем пункте");
  assert.equal(stripServiceMarks("так было [факт 3, 5] и всё"), "так было [факт 3, 5] и всё");
  assert.equal(stripServiceMarks("Я купил 3 яблока и факт 5"), "Я купил 3 яблока и факт 5");
  assert.equal(stripServiceMarks("(пункт 4) тоже остаётся"), "(пункт 4) тоже остаётся");
});

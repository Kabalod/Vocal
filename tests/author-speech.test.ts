import assert from "node:assert/strict";
import { test } from "node:test";
import { factQuote, meaningfulWords, newContentWords, normalizeTranscript, removeFillers, stripServiceMarks } from "../src/lib/author-speech";

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

import { dedupeScript, fixHomoglyphs, materialAfterDontKnow, scriptRepeats } from "../src/lib/author-speech";

test("I2b: Latin look-alikes inside Cyrillic words become Cyrillic; Latin words stay", () => {
  assert.equal(fixHomoglyphs("тётя Любa сказала"), "тётя Люба сказала", "Latin a in «Любa»");
  assert.equal(fixHomoglyphs("Тётя Любa, торгующая сметаной"), "Тётя Люба, торгующая сметаной");
  assert.equal(fixHomoglyphs("cметана и pынок"), "сметана и рынок", "c and p");
  assert.equal(fixHomoglyphs("Я купил iPhone и OK"), "Я купил iPhone и OK", "words fully in Latin are left alone");
  assert.equal(fixHomoglyphs("Обычный текст."), "Обычный текст.");
});

test("I2b: 'не помню' keeps a useful remainder and drops a statement of not knowing", () => {
  assert.equal(materialAfterDontKnow("Не помню имя, но это было в мае"), "Это было в мае", "the useful remainder stays");
  assert.equal(materialAfterDontKnow("Не помню имя, а встретились мы на рынке у входа"), "Встретились мы на рынке у входа");
  assert.equal(materialAfterDontKnow("Честно говоря, я не помню, кому именно рассказываю эту историю; в моих записях нет ни упоминания зрителей"), null, "the remainder is not knowing again");
  assert.equal(materialAfterDontKnow("Не помню"), null);
  assert.equal(materialAfterDontKnow("Не помню имя, но в мае"), null, "a remainder of fewer than four words");
  assert.equal(materialAfterDontKnow("Я помню, что это было в мае"), "Я помню, что это было в мае", "no don't-know opening: unchanged");
});

test("I2b: a sentence that repeats an earlier one is dropped once, paragraphs and the first occurrence stay", () => {
  const script = "Тётя Люба советует брать сметану развесную, потому что в банке она жидкая.\nЯ хожу на рынок в шесть утра по вторникам.\nТётя Люба всегда советует брать развесную сметану, в банке она слишком жидкая. Потом я иду домой.";
  const out = dedupeScript(script);
  assert.equal(out.removed, 1);
  assert.equal(out.text, "Тётя Люба советует брать сметану развесную, потому что в банке она жидкая.\nЯ хожу на рынок в шесть утра по вторникам.\nПотом я иду домой.");
  assert.equal(scriptRepeats(script), 1);
  assert.equal(scriptRepeats(out.text), 0);
  assert.equal(dedupeScript("Я пошёл домой. Там было тихо.").removed, 0, "short different sentences are kept");
});

// ---- I2c: quote choice ------------------------------------------------------------------------------------------------------

const quoteFact = "Тётя Люба советует брать сметану развесную, потому что в банке она слишком жидкая";

test("I2c: a quote loses leading discourse words and keeps its first real word", () => {
  const q = factQuote(quoteFact, "знаете честно говоря тётя люба соседка стоит у прилавка и советует брать сметану развесную потому что в банке она слишком жидкая");
  assert.ok(q && /^Тётя люба/.test(q), q ?? "null");
  assert.doesNotMatch(q!, /знаете|честно/i);
});

test("I2c: a stray digit from the transcript is a boundary, not part of the quote", () => {
  const q = factQuote(quoteFact, "в шесть утра рынок почти пустой и всё будто замерло и я иду слушаю истории 3 а тётя люба стоит у прилавка и советует брать сметану развесную потому что в банке она слишком жидкая 4 так вот");
  assert.ok(q && /сметану развесную/.test(q), q ?? "null");
  assert.doesNotMatch(q!, /(^|\s)\d{1,2}(\s|$)/);
  assert.doesNotMatch(q!, /^А\s/);
});

test("I2c: a quote does not end on a hanging word or a cut-off modal clause", () => {
  const q = factQuote("Отказ от дешёвой работы приводит к росту цены", "я отказалась от его проекта он вернулся через неделю и согласился работать по моей цене это показало что отказ от дешёвой работы может привести к");
  assert.ok(q, "no quote");
  assert.doesNotMatch(q!, /(привести|может|к|и|что)$/i);
});

test("I2c: the window with a concrete detail beats a general window", () => {
  const q = factQuote("Группа из двенадцати бегунов: четверо ушли", "вообще бегать полезно для сердца и для настроения и вообще для всего организма. в группе из двенадцати новичков ушли четверо бегавших каждый день");
  assert.ok(q && /двенадцати/.test(q), q ?? "null");
});

test("I2c: an answer that opens with 'не помню' gives no quote, its useful remainder may", () => {
  assert.equal(factQuote("Давление поднималось до высоких цифр", "не помню точных дат давление поднималось до высоких цифр"), null);
  const q = factQuote("Давление поднималось до высоких цифр в августе", "не помню имя врача, но давление поднималось до высоких цифр в августе три раза подряд");
  assert.ok(q && /августе/.test(q), q ?? "null");
  assert.doesNotMatch(q!, /не помню/i);
});

// ---- K1: facts from "не помню / не знаю / нет ни …" ------------------------------------------------------------------------------

test("K1: acceptableFactText drops a don't-know fact, keeps a useful remainder of four or more words, and leaves normal facts alone", async () => {
  const { acceptableFactText } = await import("../src/lib/author-speech");
  const { isUnknownAnswer } = await import("../src/lib/question-guard");
  assert.equal(acceptableFactText("Честно говоря, я не помню, о чём именно речь.", "Честно говоря, я не помню, о чём именно речь."), null);
  assert.equal(acceptableFactText("Нет ни записей, ни фото.", "Нет ни записей, ни фото."), null);
  assert.equal(acceptableFactText("Я не знаю.", "Я не знаю."), null);
  assert.equal(acceptableFactText("Не помню имя, но это было в мае на рынке у входа", "Не помню имя, но это было в мае на рынке у входа"), "Это было в мае на рынке у входа");
  assert.equal(acceptableFactText("Тётя Люба продаёт сметану развесную", "Не помню имя, но тётя Люба продаёт сметану развесную"), "Тётя Люба продаёт сметану развесную");
  assert.equal(acceptableFactText("Я ходил на рынок в шесть утра", "Я ходил на рынок в шесть утра"), "Я ходил на рынок в шесть утра");
  assert.equal(acceptableFactText("Я не помню", "Не помню"), null);
  // the topic closes: G1 reads these answers as "unknown"
  assert.equal(isUnknownAnswer("Нет ни записей, ни фото."), true);
  assert.equal(isUnknownAnswer("Честно говоря, я не помню, о чём именно речь."), true);
});

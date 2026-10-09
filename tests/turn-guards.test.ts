import assert from "node:assert/strict";
import { test } from "node:test";
import { isDontKnow, isEndPhrase, isYes, questionAssumesRole, questionEchoesAuthor, questionNeedsHintCheck, questionOffersAlternatives, wordCount } from "../src/lib/turn-policy";

test("closed lists: end phrases, 'не знаю', yes", () => {
  for (const t of ["Хочу закончить.", "хватит", "Главное я сказал.", "Главное я уже сказал", "Закончим", "Больше нечего добавить."]) assert.equal(isEndPhrase(t), true, t);
  for (const t of ["Хочу закончить фразу про кофе и добавить деталь", "Главное — это привычка"]) assert.equal(isEndPhrase(t), false, t);
  for (const t of ["Не знаю.", "не помню", "Не знаю, как сказать", "...", "?"]) assert.equal(isDontKnow(t), true, t);
  for (const t of ["Не знаю, но в марте я начал бегать каждое утро", "Знаю, было так"]) assert.equal(isDontKnow(t), false, t);
  assert.equal(isYes("Да."), true);
  assert.equal(isYes("Да, но позже расскажу"), false);
  assert.equal(wordCount("раз два  три"), 3);
});

test("A8: a question that only repeats the author's last answer is an echo; a new question is not", () => {
  const answer = "Хочу сказать тем, кто бросает через неделю: не ждите настроения, просто начинайте.";
  assert.equal(questionEchoesAuthor("Хотите сказать тем, кто бросает через неделю: не ждите настроения, просто начинайте?", [answer]), true);
  assert.equal(questionEchoesAuthor("Что вы почувствовали, когда бросили через неделю?", [answer]), false, "the new part of the question keeps it from being an echo");
  assert.equal(questionEchoesAuthor("Что вы почувствовали в тот день, когда вышли на пробежку?", [answer]), false);
  assert.equal(questionEchoesAuthor("Что дальше?", [answer]), false, "too short to judge");
});

test("A10: option lists and assumed roles are flagged only when the author did not name them", () => {
  const answers = "Глутамат не вызывает зависимость, я так читал.";
  assert.equal(questionOffersAlternatives("Какие биологические или психологические механизмы этому препятствуют?", answers), true);
  assert.equal(questionOffersAlternatives("Какие биологические или психологические механизмы этому препятствуют?", "Я читал про биологические и психологические механизмы"), false, "named by the author");
  assert.equal(questionOffersAlternatives("Какой совет или действие вы хотите предложить?", answers), false, "nouns are not option lists");
  assert.equal(questionAssumesRole("Приведите случай, когда вы применяли подход при работе с пациентом.", answers), true);
  assert.equal(questionAssumesRole("Приведите случай, когда вы применяли подход при работе с пациентом.", "У меня был пациент в клинике"), false);
  assert.equal(questionNeedsHintCheck("Что было дальше?", answers), null);
});

test("rich-author finding: service markers in decisions are not author material for the script", async () => {
  const { isServiceDecision } = await import("../src/lib/v05-script");
  assert.equal(isServiceDecision("content_mode:personal_story"), true);
  assert.equal(isServiceDecision("diagnosed:cmv0guas50006dmbop4hva6lm"), true);
  assert.equal(isServiceDecision("Снять дубль про утро"), false);
});

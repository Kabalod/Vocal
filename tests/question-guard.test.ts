import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { isSubstantiveAnswer } from "../src/lib/turn-policy";
import {
  composeUnderstandingList,
  detectGenre,
  MAX_QUESTION_WORDS,
  questionProblem,
  topicRepeat,
  UNDERSTANDING_MAX_WORDS,
} from "../src/lib/question-guard";

type Turn = { role: "user" | "assistant"; kind?: string; text: string };
const load = (id: string): { take: string; turns: Turn[] } =>
  JSON.parse(readFileSync(path.join(__dirname, "fixtures", "transcript-run3", `${id}.json`), "utf8"));

const isQuestion = (t: Turn) => t.role === "assistant" && t.kind === "question" && !/^(Я понял так|Пока у нас так)/.test(t.text);

/** Replays a recorded dialogue: for every question of Vocal, would G1 / G2 have stopped it? */
function replay(id: string) {
  const { take, turns } = load(id);
  const genre = detectGenre([take, ...turns.filter((t) => t.role === "user").map((t) => t.text)]);
  const past: { q: string; answered: boolean }[] = [];
  const authorTexts: string[] = [];
  const out: { n: number; q: string; repeat: string | null; problem: string | null; words: number }[] = [];
  let n = 0;
  turns.forEach((turn, i) => {
    if (turn.role === "user") {
      authorTexts.push(turn.text);
      return;
    }
    if (!isQuestion(turn)) return;
    n += 1;
    const lastAnswer = [...turns.slice(0, i)].reverse().find((t) => t.role === "user")?.text;
    const repeat = topicRepeat({
      question: turn.text,
      answeredQuestions: past.filter((p) => p.answered).map((p) => p.q),
      allQuestions: past.map((p) => p.q),
      authorTexts: authorTexts.filter((a) => a !== "уточни"),
    });
    const problem = questionProblem(turn.text, { genre, lastAnswer })?.code ?? null;
    out.push({ n, q: turn.text, repeat, problem, words: turn.text.split(/\s+/).length });
    const next = turns.slice(i + 1).find((t) => t.role === "user");
    past.push({ q: turn.text, answered: Boolean(next) && isSubstantiveAnswer(next!.text, turn.text) });
  });
  return { genre, out };
}

test("G1: recorded run 3 - repeated topics are found, first questions and fresh topics are not", () => {
  const flagged = (id: string) => replay(id).out.filter((x) => x.repeat).map((x) => x.n);
  assert.deepEqual(flagged("P1"), [2, 6], "P1: the same question twice (1 and 2); the viewer question a second time");
  assert.deepEqual(flagged("P2"), [2, 4, 5, 6, 7, 8], "P2: the adaptation mechanism asked again and again");
  assert.deepEqual(flagged("P3"), [2, 3, 5], "P3: the example the author already gave, the same 'why was it worth it' twice");
  assert.deepEqual(flagged("P4"), [2, 4, 5, 8], "P4: the early market trip asked four more times");
  assert.deepEqual(flagged("P5"), []);
  assert.deepEqual(flagged("P6"), [3], "P6: the second 'главный вывод' question; its other problems are lexical, see G2");
});

test("G1+G2: questions the server would have stopped per recorded dialogue (before: owner counted P4 5 of 8, P2 7 of 8)", () => {
  const stopped = (id: string) => replay(id).out.filter((x) => x.repeat || x.problem).map((x) => x.n);
  assert.deepEqual(stopped("P4"), [2, 4, 5, 6, 8], "5 of 8");
  assert.equal(stopped("P2").length >= 6, true, `P2: ${stopped("P2")}`);
  assert.deepEqual(stopped("P6"), [1, 2, 3, 4], "P6: 'вывод', 'не сработает', 'вывод', 'при каких условиях'");
  assert.deepEqual(stopped("P5"), [1], "P5: only the first question, 18 words (over the 15-word limit)");
});

test("G2: forbidden lexicon, length and one question", () => {
  const ctx = { genre: "explanation" as const, lastAnswer: "я купил сметану" };
  for (const q of [
    "Какой механизм за этим стоит?",
    "Какую позицию вы занимаете?",
    "Какой вывод вы сделали?",
    "Как это происходит в теме «Рынок», шаг за шагом?",
    "В какой ситуации это не сработает?",
    "При каких условиях это работает?",
    "Что вы хотите донести из этого опыта?",
    "Что зритель должен унести из ролика?",
    "Каким образом ранний подъём приводит к бодрости?",
  ]) assert.ok(questionProblem(q, ctx), q);
  for (const q of ["А что сказала тётя Люба?", "Почему именно четверо из двенадцати бросили?", "На каком примере это видно?"]) assert.equal(questionProblem(q, ctx), null, q);
  assert.equal(questionProblem("Что вы почувствовали, когда телефон сел, и что вы стали делать дальше вечером в вагоне, пока соседи спали?", ctx)?.code, "длина");
  assert.equal(MAX_QUESTION_WORDS, 15);
  assert.equal(questionProblem("Что было? А потом?", ctx)?.code, "несколько вопросов");
  assert.equal(questionProblem("Как это идёт шаг за шагом?", { ...ctx, lastAnswer: "сначала я встаю, потом иду" }), null, "a process was told: 'шаг за шагом' is fine");
});

test("G4: genre by the take and the answers; story and humor never get 'вывод/условия' questions", () => {
  assert.equal(replay("P2").genre, "explanation");
  for (const id of ["P1", "P3", "P4", "P5", "P6"]) assert.equal(replay(id).genre, "story", id);
  assert.equal(detectGenre(["Это было так смешно, я до сих пор ржу над этой шуткой.", "Смешной момент: я упал в сугроб, это прикол."]), "humor");
  assert.equal(detectGenre(["Запомните: делайте зарядку утром.", "Попробуйте, начните с пяти минут, запишите результат."]), "advice");
  assert.ok(questionProblem("При каких условиях это было смешно?", { genre: "humor" }));
  assert.ok(questionProblem("Это было эффективно?", { genre: "story" }));
  assert.equal(questionProblem("Это было эффективно?", { genre: "explanation" }), null);
});

test("G6: the 'what we have so far' reply is a short list in the author's words, no third person, at most 45 words", () => {
  for (const id of ["P1", "P2", "P3", "P4", "P5", "P6"]) {
    const { turns } = load(id);
    const answers = turns.filter((t) => t.role === "user").map((t) => t.text).slice(1);
    const text = composeUnderstandingList(["Автор просыпалась в 3 ч ночи", "Зритель должен почувствовать перемену"], answers.filter((a) => !/сценарий/.test(a)));
    assert.ok(text, id);
    assert.match(text!, /^Пока у нас так:\n— /);
    assert.ok(text!.endsWith("\nСобрать сценарий?"));
    assert.ok(text!.split(/\s+/).length <= UNDERSTANDING_MAX_WORDS, `${id}: ${text!.split(/\s+/).length} words`);
    assert.equal((text!.match(/\?/g) ?? []).length, 1);
    assert.doesNotMatch(text!, /Автор |Зритель должен/, "facts written about 'the author' are not repeated");
    const items = text!.split("\n").filter((l) => l.startsWith("— "));
    assert.ok(items.length >= 2 && items.length <= 3, `${id}: ${items.length} items`);
  }
  assert.equal(composeUnderstandingList([], []), null);
});

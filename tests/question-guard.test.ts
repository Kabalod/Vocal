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

import { anchoredByGenre, anchoredByKind, isUnknownAnswer, questionHasAnchor } from "../src/lib/question-guard";
import { neutralQuestionReply } from "../src/lib/author-text-guard";
import { TAKE_PROPOSAL_PHRASE } from "../src/lib/agent-action";

test("H3: 'не помню / не знаю' closes the topic and its relatives (P4 and P3 patterns)", () => {
  assert.equal(isUnknownAnswer("не помню"), true);
  assert.equal(isUnknownAnswer("ну не помню точно честно не знаю"), true);
  assert.equal(isUnknownAnswer("не думал об этом"), true);
  assert.equal(isUnknownAnswer("не помню название но это были помидоры и огурцы с дачи у соседки"), false, "content after the don't-know phrase keeps the answer open");
  const ctx = { authorTexts: ["раньше я покупал всё по списку", "я хожу на рынок к шести утра"], answeredQuestions: [] as string[], allQuestions: [] as string[] };
  // P4: the vegetable question was answered "не помню"; its relative ("впервые" / "обычно") is not asked
  const veg = "Какой овощ ты впервые купил на рынке в эти утренние походы?";
  assert.equal(topicRepeat({ ...ctx, question: "Какой овощ ты обычно берёшь на рынке в такие утренние походы?", allQuestions: [veg], closedQuestions: [veg] }), "closed_topic");
  // P4: the neighbour Marina
  const marina = "Что именно сказала соседка Марина про воздух в эти ранние часы?";
  assert.equal(topicRepeat({ ...ctx, question: "Какой комментарий Марина обычно делала о воздухе в эти ранние часы?", allQuestions: [marina], closedQuestions: [marina] }), "closed_topic");
  // P3: the sheet on the wall
  const sheet = "Как именно ты прикрепила листок к стене над рабочим столом?";
  assert.equal(topicRepeat({ ...ctx, question: "Где именно висит листок над рабочим столом?", allQuestions: [sheet], closedQuestions: [sheet] }), "closed_topic");
  // an unrelated question is not blocked by a closed one
  assert.equal(topicRepeat({ ...ctx, question: "Сколько недель вы так ходите?", allQuestions: [marina], closedQuestions: [marina] }), null);
});

test("H4: a question needs an anchor word from the take, the title or the last answers; no server template lacks it or breaks G2", () => {
  const anchors = ["Я начал ходить на рынок в шесть утра", "Рынок и сметана", "тётя Люба говорит что сметана в банке жидкая"];
  assert.equal(questionHasAnchor("С чего это обычно начинается?", anchors), false);
  assert.equal(questionHasAnchor("Что тогда сказали?", anchors), false);
  assert.equal(questionHasAnchor("А что сказала тётя Люба про сметану?", anchors), true);
  assert.equal(questionProblem("С чего это обычно начинается?", { genre: "story", anchorTexts: anchors })?.code, "без опоры");
  assert.equal(questionProblem("А что сказала тётя Люба про сметану?", { genre: "story", anchorTexts: anchors }), null);
  const kinds = ["no_episode", "no_thesis", "facts_vs_interpretation", "no_mechanism", "unclear_terms", "repeat_unchecked", "no_boundary", "no_audience", "multiple_topics", "promise_unclear", "viewer_effect"] as const;
  for (const kind of kinds) {
    for (const topic of [null, "Рынок и сметана"]) {
      const neutral = String(neutralQuestionReply([{ id: `gap_${kind}`, text: "x", status: "open", kind }], [], [], topic).question);
      assert.equal(questionProblem(neutral, { genre: "story" }), null, `neutral ${kind}/${topic}: ${neutral}`);
      assert.doesNotMatch(neutral, /шаг за шагом|в теме/i, `${kind}: the old 'в теме … шаг за шагом' template is gone`);
      const anchored = anchoredByKind(kind, topic);
      if (anchored) assert.equal(questionProblem(anchored, { genre: "story", anchorTexts: topic ? [topic] : undefined }), null, `anchored ${kind}/${topic}: ${anchored}`);
    }
  }
  for (const genre of ["story", "humor", "explanation", "advice"] as const) {
    for (const q of anchoredByGenre(genre, "Рынок и сметана")) assert.equal(questionProblem(q, { genre, anchorTexts: ["Рынок и сметана"] }), null, q);
  }
});

test("H5: petty questions are stopped; speech, number and reaction questions are not", () => {
  const ctx = { genre: "story" as const };
  for (const q of ["В каком месяце у вас дрожали руки?", "Какой овощ вы впервые купили на рынке?", "Какой именно цвет был у листка?", "Как именно вы прикрепили листок к стене?", "Во сколько именно вы пришли на рынок?"]) assert.equal(questionProblem(q, ctx)?.code, "мелочь", q);
  for (const q of ["Что сказал директор?", "Сколько человек бросило бег?", "Что вы почувствовали, когда телефон сел?"]) assert.equal(questionProblem(q, ctx), null, q);
});

test("H6: 'ты' and singular past forms after 'вы' are stopped; forms without gender pass", () => {
  const ctx = { genre: "story" as const };
  for (const q of ["Что ты имел в виду?", "Какой комментарий ты привела?", "Как твоя цена изменилась?", "Что вы сделал потом?", "Что вы тогда почувствовала?"]) assert.equal(questionProblem(q, ctx)?.code, "ты или род", q);
  for (const q of ["Что вы имели в виду?", "Что вы почувствовали?", "Что вы стали делать потом?", "Что было потом?"]) assert.equal(questionProblem(q, ctx), null, q);
});

test("H7: a question about the command word itself is stopped", () => {
  assert.equal(questionProblem("Что вы имели в виду, сказав «уточни»?", { genre: "story" })?.code, "команда принята за речь");
  assert.equal(questionProblem("Что ты имел в виду?", { genre: "story", lastIsCommand: true })?.code, "ты или род");
});

import { questionRulesBlock, questionRulesVariant } from "../src/lib/question-guard";

test("H1: the three variants of the question-rules block; B (short, the fact rule first) is the default", () => {
  assert.equal(questionRulesVariant({}), "short");
  assert.equal(questionRulesVariant({ VOCAL_QUESTION_RULES: "0" }), "off");
  assert.equal(questionRulesVariant({ VOCAL_QUESTION_RULES: "off" }), "off");
  assert.equal(questionRulesVariant({ VOCAL_QUESTION_RULES: "full" }), "full");
  assert.equal(questionRulesBlock("story", "off"), "");
  const b = questionRulesBlock("story", "short");
  assert.ok(b.startsWith("Если в ответе автора есть новое содержательное утверждение, верни его словами автора в thoughtUpdate.fact."), "the fact rule is first");
  assert.ok(b.includes("Спрашивай про самую яркую деталь из последнего ответа автора (число, имя, реплика).") && b.includes("Обращайся на «вы», без «ты»."));
  assert.equal(b.split(/(?<=[.!?])\s+/).length, 3, "the fact rule and the two sentences of the owner's wording");
  const c = questionRulesBlock("story", "full");
  assert.ok(c.includes("мелочи") && c.includes("не помню") && c.includes("команда"));
});

test("I4: the approved wording of every gap type in NEUTRAL_QUESTIONS (no_mechanism and unclear_terms as the owner set them)", () => {
  const expected: Record<string, string> = {
    no_episode: "Какой случай вы помните лучше всего?",
    no_thesis: "Если сказать одним предложением, о чём этот ролик?",
    facts_vs_interpretation: "Что вы сами при этом видели или слышали?",
    no_mechanism: "Что вы делаете в самом начале?",
    repeat_unchecked: "Бывало ли так ещё раз?",
    no_boundary: "Для кого это точно не подойдёт?",
    no_audience: "Кому вы это рассказываете?",
    multiple_topics: "Про что из этого снимем ролик?",
    promise_unclear: "Что человек получит, дослушав до конца?",
    viewer_effect: "Что человек должен сделать после ролика?",
  };
  for (const [kind, text] of Object.entries(expected)) {
    const reply = neutralQuestionReply([{ id: `gap_${kind}`, text: "x", status: "open", kind: kind as never }]);
    assert.equal(reply.question, text, kind);
    assert.equal(questionProblem(text, { genre: "story" }), null, `${kind} passes the question rules`);
  }
  // with a topic only no_episode names it
  assert.equal(neutralQuestionReply([{ id: "g", text: "x", status: "open", kind: "no_episode" }], [], [], "Рынок").question, "Какой случай про «Рынок» вы помните лучше всего?");
  // unclear_terms puts the word itself in; without a word the question is not shown (the generic question is asked instead)
  const withTerm = neutralQuestionReply([{ id: "g", text: "Не определено слово «успех».", status: "open", kind: "unclear_terms" }]);
  assert.equal(withTerm.question, "Что вы имеете в виду под «успех»?");
  assert.equal(withTerm.gapId, "g");
  const withoutTerm = neutralQuestionReply([{ id: "g", text: "Непонятно, что значит это слово.", status: "open", kind: "unclear_terms" }]);
  assert.equal(withoutTerm.question, "Что здесь самое главное?", "no word: not shown");
  assert.equal(withoutTerm.gapId, undefined);
  // the other fixed phrases of G5
  assert.equal(TAKE_PROPOSAL_PHRASE, "Материала уже хватает. Запишем следующий дубль или соберём сценарий?");
});

test("I3: 'Сколько…' at most once in three questions, 'Кто такой X?' only when X was not met in the author's answers (logs h1-B, 18 dialogues)", () => {
  type T = { role: "user" | "assistant"; kind?: string; text: string };
  const dialogues = JSON.parse(readFileSync(path.join(__dirname, "fixtures", "h1-b-dialogues.json"), "utf8")) as { id: string; turns: T[] }[];
  let questions = 0, counts = 0, windowsBefore = 0, windowsAfter = 0, whoBefore = 0, whoStopped = 0, countsAfter = 0;
  for (const d of dialogues) {
    const asked: string[] = [];
    const shown: string[] = [];
    const answers: string[] = [];
    for (const t of d.turns) {
      if (t.role === "user") { answers.push(t.text); continue; }
      if (t.kind !== "question" || /^(Пока у нас так|Я понял так)/.test(t.text)) continue;
      questions += 1;
      const before = asked.slice(-2);
      if (isCountQuestion(t.text)) { counts += 1; if (before.some(isCountQuestion)) windowsBefore += 1; }
      if (/^Кто такой/.test(t.text)) whoBefore += 1;
      const problem = questionProblem(t.text, { genre: "story", recentQuestions: shown, answerTexts: answers });
      if (problem?.code === "уже сказано: Кто такой") whoStopped += 1;
      // a stopped question is replaced by one that is not a "Сколько" (the fixed replacement)
      const final = problem ? "Что было дальше?" : t.text;
      if (isCountQuestion(final)) { countsAfter += 1; if (shown.slice(-2).some(isCountQuestion)) windowsAfter += 1; }
      shown.push(final);
      asked.push(t.text);
    }
  }
  assert.equal(questions, 142);
  assert.equal(counts, 16, "'Сколько…' in the logs: 16 of 142 (11 %)");
  assert.equal(windowsBefore, 2, "two questions had another 'Сколько…' among the previous two");
  assert.equal(windowsAfter, 0, "after the rule: none");
  assert.equal(whoBefore, 1);
  assert.equal(whoStopped, 1, "'Кто такой Саша…?' - Саша is in the author's answers");
  assert.ok(countsAfter <= counts);
  // unit cases
  assert.equal(questionProblem("Сколько вы там ждали?", { genre: "story", recentQuestions: ["Что сказал директор?", "Сколько недель вы так ходите?"] })?.code, "однообразие: Сколько");
  assert.equal(questionProblem("Сколько вы там ждали?", { genre: "story", recentQuestions: ["Сколько недель вы так ходите?", "Что сказал директор?", "Что вы почувствовали?"] }), null, "a third question back is outside the window");
  assert.equal(questionProblem("Кто такой Саша, который принёс сочинение?", { genre: "story", answerTexts: ["Ко мне пришёл Саша с сочинением"] })?.code, "уже сказано: Кто такой");
  assert.equal(questionProblem("Кто такой Саша, который принёс сочинение?", { genre: "story", answerTexts: ["Ко мне пришёл ученик с сочинением"] }), null, "a name the author has not mentioned");
});

import { isCountQuestion } from "../src/lib/question-guard";

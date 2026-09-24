import assert from "node:assert/strict";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";
import { uniqueNewQuestions } from "../src/lib/question-text";
import { annotateQuotes, quoteFoundInText } from "../src/lib/evidence";

test("exact duplicate question texts are dropped before save", () => {
  assert.deepEqual(
    uniqueNewQuestions(
      ["Зачем чай?", "зачем чай?", "Что дальше?", "Зачем чай?"],
      ["Что дальше?"],
    ),
    ["Зачем чай?"],
  );
});

test("quotes are marked found or missing without claiming the idea is true", () => {
  const text = "Вымышленный чай остыл на подоконнике.";
  assert.equal(quoteFoundInText(text, "чай остыл"), true);
  assert.equal(quoteFoundInText(text, "личная драма героя"), false);
  const marked = annotateQuotes(text, [
    { text: "чай остыл" },
    { text: "обязательный CTA" },
  ]);
  assert.equal(marked[0].found, true);
  assert.equal(marked[1].found, false);
});

test("review and questions: versions, no scores, answers without AI, invalid JSON", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
      t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
  });

  const { createReel, createTake } = await import("../src/lib/reels");
  const { ensureOriginalFromText } = await import("../src/lib/transcripts");
  const { saveProfile } = await import("../src/lib/profile");
  const { saveReelContext } = await import("../src/lib/reel-context");
  const { createTakeReview, listTakeReviews } = await import("../src/lib/ai/review");
  const { continueQuestions, listReelQuestions, updateQuestion } = await import("../src/lib/ai/questions");
  const { PATCH: patchQuestion } = await import("../src/app/api/questions/[id]/route");

  const reel = await createReel({ title: "Вымышленный разбор" });
  const take = await createTake(reel.id, {
    inputType: "text",
    bodyText: "Вымышленный чай остыл на подоконнике. Я хочу говорить спокойно.",
  });
  await ensureOriginalFromText(take.id, take.bodyText);
  await saveProfile({
    fields: [
      {
        id: "whyRecord",
        text: "вымышленный автор теста пьёт чай",
        usage: "in_text",
      },
    ],
  });
  await saveReelContext(reel.id, {
    reelGoal: "спокойный ролик про чай",
    selectedKeys: ["whyRecord"],
  });

  let completeCalls = 0;
  const review = await createTakeReview(take.id, {}, async () => {
    completeCalls += 1;
    return {
      text: JSON.stringify({
        authorThought: "Чай остыл, хочется спокойной речи.",
        modelSuggestion: "Можно начать с подоконника.",
        quotes: [{ text: "чай остыл" }, { text: "конфликт с соседом" }],
        keep: ["подоконник"],
        missing: ["зачем зрителю"],
        notInText: ["конфликт с соседом"],
        insufficientMaterial: false,
        questions: ["Зачем вам этот чай?"],
      }),
    };
  });
  assert.equal(review.status, "done");
  assert.equal(review.transcriptRevisionId.length > 0, true);
  assert.ok(review.contextSnapshotId);
  assert.equal(review.result?.quotes[0].found, true);
  assert.equal(review.result?.quotes[1].found, false);
  assert.equal("overallScore" in (review.result ?? {}), false);
  const questionsAfterReview = await listReelQuestions(reel.id);
  assert.equal(questionsAfterReview.length, 1);

  const frozenThought = review.result?.authorThought;
  const patched = await patchQuestion(
    new Request("http://vocal.local/api/questions/x", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Чтобы согреться вымышленно." }),
    }),
    { params: Promise.resolve({ id: questionsAfterReview[0].id }) },
  );
  assert.equal(patched.status, 200);
  assert.equal(completeCalls, 1);
  const reviewsAfterAnswer = await listTakeReviews(take.id);
  assert.equal(reviewsAfterAnswer[0].result?.authorThought, frozenThought);
  assert.equal(reviewsAfterAnswer[0].id, review.id);

  await updateQuestion(questionsAfterReview[0].id, { status: "skipped" });

  await continueQuestions(reel.id, { takeId: take.id }, async ({ user }) => {
    completeCalls += 1;
    assert.match(user, /skipped/);
    assert.match(user, /Чтобы согреться/);
    return {
      text: JSON.stringify({
        questions: ["Что остаётся, если чай убрать?"],
        note: "",
      }),
    };
  });
  const allQuestions = await listReelQuestions(reel.id);
  assert.equal(allQuestions.length, 2);
  assert.equal(allQuestions[0].text, "Зачем вам этот чай?");
  assert.equal(allQuestions[1].text, "Что остаётся, если чай убрать?");

  const emptyQs = await continueQuestions(reel.id, { takeId: take.id }, async () => {
    completeCalls += 1;
    return { text: JSON.stringify({ questions: [] }) };
  });
  assert.equal(emptyQs.length, 2);

  const bad = await createTakeReview(take.id, { previousReviewId: review.id }, async () => {
    completeCalls += 1;
    return { text: "это не json и не разбор" };
  });
  assert.equal(bad.status, "error");
  assert.equal(bad.result, null);
  await assert.rejects(
    () => createTakeReview(take.id, { previousReviewId: bad.id }, async () => ({ text: "{}" })),
    (error: unknown) => error instanceof Error && /этого же дубля/.test(error.message),
  );
  const stillOld = await listTakeReviews(take.id);
  assert.equal(stillOld.find((item) => item.id === review.id)?.result?.authorThought, frozenThought);
  assert.ok(completeCalls >= 4);

  const takeTwo = await createTake(reel.id, {
    inputType: "text",
    bodyText: "Второй вымышленный дубль про кружку.",
  });
  await ensureOriginalFromText(takeTwo.id, takeTwo.bodyText);
  const callsBeforeCross = completeCalls;
  await assert.rejects(
    () =>
      createTakeReview(takeTwo.id, { previousReviewId: review.id }, async () => {
        completeCalls += 1;
        return { text: JSON.stringify({ authorThought: "не должен вызваться" }) };
      }),
    (error: unknown) => error instanceof Error && /этого же дубля/.test(error.message),
  );
  assert.equal(completeCalls, callsBeforeCross);
  const takeTwoReviews = await listTakeReviews(takeTwo.id);
  assert.equal(takeTwoReviews.length, 0);

  const questionId = questionsAfterReview[0].id;
  const beforeFail = await prisma.question.findUnique({ where: { id: questionId } });
  assert.equal(beforeFail?.status, "skipped");
  await assert.rejects(
    () => updateQuestion(questionId, { status: "not_relevant", text: "   " }),
    (error: unknown) => error instanceof Error && /Введите ответ/.test(error.message),
  );
  const afterFailed = await prisma.question.findUnique({
    where: { id: questionId },
    include: { answers: true },
  });
  assert.equal(afterFailed?.status, "skipped");
  assert.equal(afterFailed?.answers.length, 1);
  assert.equal(afterFailed?.answers[0].text, "Чтобы согреться вымышленно.");

  const edited = await updateQuestion(questionId, { text: "Исправленный ответ про чай." });
  assert.equal(edited.answers.length, 1);
  assert.equal(edited.answers[0].text, "Исправленный ответ про чай.");
  assert.equal(edited.status, "answered");

  await continueQuestions(reel.id, { takeId: take.id }, async () => ({
    text: JSON.stringify({
      questions: ["Что остаётся, если чай убрать?", "Зачем вам этот чай?", "Новый вопрос про кружку"],
    }),
  }));
  const deduped = await listReelQuestions(reel.id);
  assert.equal(deduped.filter((row) => row.text === "Что остаётся, если чай убрать?").length, 1);
  assert.equal(deduped.filter((row) => row.text === "Зачем вам этот чай?").length, 1);
  assert.equal(deduped.some((row) => row.text === "Новый вопрос про кружку"), true);
});

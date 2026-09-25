import assert from "node:assert/strict";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";
import { AgentActionError } from "../src/lib/agent-action";
import { sendDialogueMessage } from "../src/lib/dialogue";
import { createTake } from "../src/lib/reels";
import { createThoughtFromText } from "../src/lib/thought-create";
import { applyThoughtState, getThoughtState } from "../src/lib/thought-state";
import { ensureOriginalFromText } from "../src/lib/transcripts";
import { askQuestionJson } from "./helpers/agent-action-json";

test("old reply JSON is rejected and does not become an action", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  const { reel } = await createThoughtFromText({
    title: "V03 schema",
    body: "Исходная мысль для контракта действий.",
    idempotencyKey: "v03-old-json",
  });
  await assert.rejects(
    () =>
      sendDialogueMessage(reel.id, { text: "привет", idempotencyKey: "v03-old-1" }, async () => ({
        text: JSON.stringify({ reply: "старый ответ", scriptProposal: null }),
        usage: { promptTokens: 1, completionTokens: 1 },
      })),
    (error: unknown) => error instanceof AgentActionError && error.code === "AGENT_ACTION_INVALID",
  );
  assert.equal(await prisma.reel.findUniqueOrThrow({ where: { id: reel.id } }).then((row) => row.status), "idea");
});

test("ask_question does not change reel status", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  const { reel } = await createThoughtFromText({
    title: "V03 ask",
    body: "Материал для вопроса.",
    idempotencyKey: "v03-ask",
  });
  const page = await sendDialogueMessage(reel.id, { text: "уточни", idempotencyKey: "v03-ask-1" }, async () => ({
    text: askQuestionJson("Что главное в этой мысли?"),
    usage: { promptTokens: 1, completionTokens: 1 },
  }));
  const question = page.messages.find((item) => item.kind === "question");
  assert.ok(question);
  assert.match(question.body, /главное/);
  assert.equal((await prisma.reel.findUniqueOrThrow({ where: { id: reel.id } })).status, "idea");
});

test("content_sufficient is rejected before a processed recording take", async (t) => {
  await withPostgresTestDb(t);
  await resetPrismaClient();
  const { reel } = await createThoughtFromText({
    title: "V03 sufficient",
    body: "Короткая готовая исходная мысль.",
    idempotencyKey: "v03-sufficient-text",
  });
  await assert.rejects(
    () =>
      sendDialogueMessage(reel.id, { text: "хватит", idempotencyKey: "v03-suf-1" }, async () => ({
        text: JSON.stringify({
          action: "content_sufficient",
          checkedInTranscript: "весь текст",
          whyNoGaps: "исходник достаточен",
        }),
        usage: { promptTokens: 1, completionTokens: 1 },
      })),
    (error: unknown) => error instanceof AgentActionError && error.code === "ACTION_NOT_ALLOWED",
  );
});

test("content_sufficient is allowed on a transcribed audio take", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  const { reel } = await createThoughtFromText({
    title: "V03 audio",
    body: "Исходник до записи.",
    idempotencyKey: "v03-audio",
  });
  const take = await createTake(reel.id, { inputType: "audio", bodyText: "", originalName: "take.webm" });
  await prisma.reel.update({ where: { id: reel.id }, data: { workingTakeId: take.id } });
  const revision = await ensureOriginalFromText(take.id, "Произнесённая мысль в дубле.");
  await prisma.take.update({ where: { id: take.id }, data: { selectedTranscriptId: revision.id } });
  const page = await sendDialogueMessage(reel.id, { text: "проверь дубль", idempotencyKey: "v03-suf-ok" }, async () => ({
    text: JSON.stringify({
      action: "content_sufficient",
      checkedInTranscript: revision.id,
      whyNoGaps: "замысел донесён в актуальной расшифровке",
    }),
    usage: { promptTokens: 1, completionTokens: 1 },
  }));
  assert.ok(page.messages.some((item) => item.body.includes("замысел донесён")));
  assert.equal((await prisma.reel.findUniqueOrThrow({ where: { id: reel.id } })).status, "idea");
});

test("suggest_take requires fact ids from this thought", async (t) => {
  await withPostgresTestDb(t);
  await resetPrismaClient();
  const { reel } = await createThoughtFromText({
    title: "V03 suggest",
    body: "Хочу сказать про тихий вечер.",
    idempotencyKey: "v03-suggest",
  });
  await assert.rejects(
    () =>
      sendDialogueMessage(reel.id, { text: "снимай", idempotencyKey: "v03-sug-bad" }, async () => ({
        text: JSON.stringify({
          action: "suggest_take",
          mainIdea: "тихий вечер",
          takeTask: "сказать про вечер спокойно",
          evidenceRefs: ["fact_missing"],
        }),
        usage: { promptTokens: 1, completionTokens: 1 },
      })),
    (error: unknown) => error instanceof AgentActionError && error.code === "ACTION_EVIDENCE",
  );
  await applyThoughtState({
    reelId: reel.id,
    expectedRevision: 0,
    patch: {
      facts: [
        {
          id: "fact_note_1",
          text: "тихий вечер",
          sourceType: "initial_note",
          sourceId: reel.id,
        },
      ],
    },
  });
  const page = await sendDialogueMessage(reel.id, { text: "снимай", idempotencyKey: "v03-sug-ok" }, async () => ({
    text: JSON.stringify({
      action: "suggest_take",
      mainIdea: "тихий вечер",
      takeTask: "сказать про вечер спокойно",
      evidenceRefs: ["fact_note_1"],
    }),
    usage: { promptTokens: 1, completionTokens: 1 },
  }));
  assert.ok(page.messages.some((item) => item.body.includes("сказать про вечер")));
  const state = await getThoughtState(reel.id);
  assert.equal(state.facts[0]?.id, "fact_note_1");
});

test("redirect_to_task stays on the current thought without changing status", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  const { reel } = await createThoughtFromText({
    title: "V03 redirect",
    body: "Задача этой мысли.",
    idempotencyKey: "v03-redir",
  });
  const page = await sendDialogueMessage(reel.id, { text: "как сварить кашу", idempotencyKey: "v03-redir-1" }, async () => ({
    text: JSON.stringify({
      action: "redirect_to_task",
      currentTask: "вернуться к задаче этой мысли",
    }),
    usage: { promptTokens: 1, completionTokens: 1 },
  }));
  assert.ok(page.messages.some((item) => item.body.includes("вернуться к задаче")));
  assert.equal((await prisma.reel.findUniqueOrThrow({ where: { id: reel.id } })).status, "idea");
  assert.equal((await prisma.reel.findUniqueOrThrow({ where: { id: reel.id } })).status !== "redirect_to_task", true);
});

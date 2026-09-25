import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";
import { AgentActionError, parseAgentAction } from "../src/lib/agent-action";
import { DialogueError, ensureDialogueTurnBinding, runDialogueTurn, sendDialogueMessage, turnClaimKey } from "../src/lib/dialogue";
import { createTake } from "../src/lib/reels";
import { createThoughtFromText } from "../src/lib/thought-create";
import { applyThoughtState, getThoughtState, isNonContentUtterance, ThoughtStateError } from "../src/lib/thought-state";
import { StateVersionError } from "../src/lib/ai/usage-guard";
import { v03TestSeams } from "../src/lib/v03-test-seams";
import { ensureOriginalFromText } from "../src/lib/transcripts";
import { askQuestionJson, thoughtUpdateForUserText } from "./helpers/agent-action-json";
import type { PrismaClient } from "@prisma/client";

async function committedAssistantActions(prisma: PrismaClient, reelId: string) {
  const thread = await prisma.dialogueThread.findUniqueOrThrow({ where: { reelId } });
  return prisma.dialogueMessage.findMany({
    where: {
      threadId: thread.id,
      role: "assistant",
      status: "done",
      kind: { in: ["question", "text"] },
    },
  });
}

async function assertStateAndActionUnchanged(
  prisma: PrismaClient,
  reelId: string,
  before: Awaited<ReturnType<typeof getThoughtState>>,
  actionCount: number,
) {
  const after = await getThoughtState(reelId);
  assert.equal(after.revision, before.revision);
  assert.deepEqual(after.facts, before.facts);
  assert.deepEqual(after.openGaps, before.openGaps);
  assert.equal((await committedAssistantActions(prisma, reelId)).length, actionCount);
}

test("non-content utterance matcher is limited and explicit", () => {
  for (const text of ["Я не знаю", "Не знаю ответа", "Можешь повторить?", "Я не понял вопрос", "Не знаю", "повтори"]) {
    assert.equal(isNonContentUtterance(text), true);
  }
  assert.equal(isNonContentUtterance("не знаю, но сцена на кухне вечером"), false);
});

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
});

test("user reply becomes a fact and then suggest_take can cite it", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  const { reel } = await createThoughtFromText({
    title: "V03 user fact",
    body: "Исходник без фактов диалога.",
    idempotencyKey: "v03-user-fact",
  });
  const empty = await getThoughtState(reel.id);
  assert.equal(empty.facts.length, 0);
  assert.equal(empty.openGaps.length, 0);

  await sendDialogueMessage(reel.id, { text: "Главное — тихий вечер.", idempotencyKey: "v03-user-fact-1" }, async () => {
    const update = await thoughtUpdateForUserText(prisma, reel.id, "Главное — тихий вечер.");
    return {
      text: askQuestionJson("Что ещё важно сказать?", update),
      usage: { promptTokens: 1, completionTokens: 1 },
    };
  });
  const afterReply = await getThoughtState(reel.id);
  const authorFact = afterReply.facts.find((fact) => fact.sourceType === "dialogue_message");
  assert.ok(authorFact);
  assert.equal(authorFact.text, "Главное — тихий вечер.");
  assert.match(authorFact.sourceId, /./);

  const page = await sendDialogueMessage(reel.id, { text: "можно снимать", idempotencyKey: "v03-user-fact-2" }, async () => ({
    text: JSON.stringify({
      action: "suggest_take",
      mainIdea: "тихий вечер",
      takeTask: "сказать про вечер спокойно",
      evidenceRefs: [authorFact.id],
    }),
    usage: { promptTokens: 1, completionTokens: 1 },
  }));
  assert.ok(page.messages.some((item) => item.body.includes("сказать про вечер")));
  const afterSuggest = await getThoughtState(reel.id);
  assert.equal(afterSuggest.facts.length, 1);
  assert.equal(afterSuggest.takeTask, "сказать про вечер спокойно");
});

test("redirect_to_task does not add a fact", async (t) => {
  await withPostgresTestDb(t);
  await resetPrismaClient();
  const { reel } = await createThoughtFromText({
    title: "V03 redirect fact",
    body: "Задача этой мысли.",
    idempotencyKey: "v03-redir-fact",
  });
  await sendDialogueMessage(reel.id, { text: "как сварить кашу", idempotencyKey: "v03-redir-fact-1" }, async () => ({
    text: JSON.stringify({
      action: "redirect_to_task",
      currentTask: "вернуться к задаче этой мысли",
    }),
    usage: { promptTokens: 1, completionTokens: 1 },
  }));
  const state = await getThoughtState(reel.id);
  assert.equal(state.facts.length, 0);
});

test("command utterances do not become facts", async (t) => {
  await withPostgresTestDb(t);
  await resetPrismaClient();
  const { reel } = await createThoughtFromText({
    title: "V03 commands",
    body: "Материал для команд.",
    idempotencyKey: "v03-commands",
  });
  for (const [text, key] of [
    ["снимай", "v03-cmd-s"],
    ["хватит", "v03-cmd-h"],
    ["уточни", "v03-cmd-u"],
  ] as const) {
    await sendDialogueMessage(reel.id, { text, idempotencyKey: key }, async () => ({
      text: askQuestionJson("Что главное?"),
      usage: { promptTokens: 1, completionTokens: 1 },
    }));
  }
  const state = await getThoughtState(reel.id);
  assert.equal(state.facts.length, 0);
});

test("answering a gap closes that openGap", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  const { reel } = await createThoughtFromText({
    title: "V03 close gap",
    body: "Материал с пробелом.",
    idempotencyKey: "v03-close-gap",
  });
  await applyThoughtState({
    reelId: reel.id,
    expectedRevision: 0,
    patch: {
      openGaps: [{ id: "gap_open", text: "неясна сцена", status: "open" }],
    },
  });
  await sendDialogueMessage(reel.id, { text: "уточни", idempotencyKey: "v03-close-gap-q" }, async () => ({
    text: JSON.stringify({
      action: "ask_question",
      question: "Где происходит сцена?",
      gapId: "gap_open",
      whyUnknown: "в материале места нет",
    }),
    usage: { promptTokens: 1, completionTokens: 1 },
  }));
  await sendDialogueMessage(reel.id, { text: "Сцена на кухне вечером.", idempotencyKey: "v03-close-gap-a" }, async () => {
    const update = await thoughtUpdateForUserText(prisma, reel.id, "Сцена на кухне вечером.", ["gap_open"]);
    return {
      text: askQuestionJson("Что ещё важно?", update),
      usage: { promptTokens: 1, completionTokens: 1 },
    };
  });
  const state = await getThoughtState(reel.id);
  assert.equal(state.openGaps.find((gap) => gap.id === "gap_open")?.status, "resolved");
  assert.ok(state.facts.some((fact) => fact.text.includes("кухне вечером")));
});

test("retry after ThoughtState failure completes once without a second model call", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  t.after(() => {
    v03TestSeams.afterUserMessageCreate = null;
    v03TestSeams.failThoughtStateApply = null;
  });
  const { reel } = await createThoughtFromText({
    title: "V03 recover",
    body: "Материал для восстановления запроса.",
    idempotencyKey: "v03-recover",
  });
  let afterCreate = 0;
  let failState = true;
  v03TestSeams.afterUserMessageCreate = async () => {
    afterCreate += 1;
  };
  v03TestSeams.failThoughtStateApply = async () => {
    if (failState) {
      failState = false;
      throw new ThoughtStateError("не удалось обновить состояние", "THOUGHT_STATE_INJECT");
    }
  };
  let completeCalls = 0;
  const complete = async () => {
    completeCalls += 1;
    const update = await thoughtUpdateForUserText(prisma, reel.id, "Главное — тихий вечер.");
    return {
      text: askQuestionJson("Что главное в этой мысли?", update),
      usage: { promptTokens: 1, completionTokens: 1 },
    };
  };
  await assert.rejects(
    () => sendDialogueMessage(reel.id, { text: "Главное — тихий вечер.", idempotencyKey: "v03-recover-1" }, complete),
    (error: unknown) => error instanceof ThoughtStateError,
  );
  assert.equal(completeCalls, 1);
  const before = await getThoughtState(reel.id);
  assert.equal(before.facts.length, 0);
  const page = await sendDialogueMessage(
    reel.id,
    { text: "Главное — тихий вечер.", idempotencyKey: "v03-recover-1" },
    complete,
  );
  assert.equal(completeCalls, 1);
  assert.ok(page.messages.some((item) => item.body.includes("главное")));
  const state = await getThoughtState(reel.id);
  assert.equal(state.facts.length, 1);
  assert.equal(state.facts[0]?.text, "Главное — тихий вечер.");
  assert.equal(await prisma.aiCall.count({ where: { reelId: reel.id, kind: "dialogue" } }), 1);
  assert.equal((await prisma.aiCall.findFirstOrThrow({ where: { reelId: reel.id } })).status, "done");
  assert.ok(afterCreate >= 1);
});

test("unknown and repeat replies do not create facts or close gaps", async (t) => {
  await withPostgresTestDb(t);
  await resetPrismaClient();
  const { reel } = await createThoughtFromText({
    title: "V03 unknown",
    body: "Материал с пробелом.",
    idempotencyKey: "v03-unknown",
  });
  await applyThoughtState({
    reelId: reel.id,
    expectedRevision: 0,
    patch: { openGaps: [{ id: "gap_open", text: "неясна сцена", status: "open" }] },
  });
  await sendDialogueMessage(reel.id, { text: "уточни", idempotencyKey: "v03-unknown-q" }, async () => ({
    text: JSON.stringify({
      action: "ask_question",
      question: "Где происходит сцена?",
      gapId: "gap_open",
      whyUnknown: "в материале места нет",
      thoughtUpdate: { fact: null, closeGapIds: [] },
    }),
    usage: { promptTokens: 1, completionTokens: 1 },
  }));
  await sendDialogueMessage(reel.id, { text: "Не знаю", idempotencyKey: "v03-unknown-a" }, async () => ({
    text: askQuestionJson("Где происходит сцена?", { fact: null, closeGapIds: [] }),
    usage: { promptTokens: 1, completionTokens: 1 },
  }));
  await sendDialogueMessage(reel.id, { text: "Повтори вопрос", idempotencyKey: "v03-repeat-a" }, async () => ({
    text: askQuestionJson("Где происходит сцена?", { fact: null, closeGapIds: [] }),
    usage: { promptTokens: 1, completionTokens: 1 },
  }));
  const state = await getThoughtState(reel.id);
  assert.equal(state.facts.length, 0);
  assert.equal(state.openGaps.find((gap) => gap.id === "gap_open")?.status, "open");
});

test("a mistaken fact on не знаю or повтори is rejected", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  const { reel } = await createThoughtFromText({
    title: "V03 non-fact",
    body: "Материал с пробелом.",
    idempotencyKey: "v03-non-fact",
  });
  await applyThoughtState({
    reelId: reel.id,
    expectedRevision: 0,
    patch: { openGaps: [{ id: "gap_open", text: "неясна сцена", status: "open" }] },
  });
  await sendDialogueMessage(reel.id, { text: "уточни", idempotencyKey: "v03-non-fact-q" }, async () => ({
    text: JSON.stringify({
      action: "ask_question",
      question: "Где происходит сцена?",
      gapId: "gap_open",
      whyUnknown: "в материале места нет",
      thoughtUpdate: { fact: null, closeGapIds: [] },
    }),
    usage: { promptTokens: 1, completionTokens: 1 },
  }));
  const before = await getThoughtState(reel.id);
  const actionsBefore = (await committedAssistantActions(prisma, reel.id)).length;
  const phrases = ["Я не знаю", "Не знаю ответа", "Можешь повторить?", "Я не понял вопрос"];
  for (const [index, text] of phrases.entries()) {
    await assert.rejects(
      () =>
        sendDialogueMessage(reel.id, { text, idempotencyKey: `v03-non-fact-a-${index}` }, async () => {
          const update = await thoughtUpdateForUserText(prisma, reel.id, text, ["gap_open"]);
          return {
            text: askQuestionJson("Где происходит сцена?", update),
            usage: { promptTokens: 1, completionTokens: 1 },
          };
        }),
      (error: unknown) => error instanceof AgentActionError && error.code === "ACTION_EVIDENCE",
    );
  }
  await assertStateAndActionUnchanged(prisma, reel.id, before, actionsBefore);
});

test("off-topic answer does not close the current gap", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  const { reel } = await createThoughtFromText({
    title: "V03 offtopic",
    body: "Материал с пробелом.",
    idempotencyKey: "v03-offtopic",
  });
  await applyThoughtState({
    reelId: reel.id,
    expectedRevision: 0,
    patch: { openGaps: [{ id: "gap_open", text: "неясна сцена", status: "open" }] },
  });
  await sendDialogueMessage(reel.id, { text: "уточни", idempotencyKey: "v03-off-q" }, async () => ({
    text: JSON.stringify({
      action: "ask_question",
      question: "Где происходит сцена?",
      gapId: "gap_open",
      whyUnknown: "в материале места нет",
    }),
    usage: { promptTokens: 1, completionTokens: 1 },
  }));
  await sendDialogueMessage(reel.id, { text: "Это не относится к ролику", idempotencyKey: "v03-off-a" }, async () => {
    const update = await thoughtUpdateForUserText(prisma, reel.id, "Это не относится к ролику", []);
    return {
      text: askQuestionJson("Вернёмся к сцене.", update),
      usage: { promptTokens: 1, completionTokens: 1 },
    };
  });
  const state = await getThoughtState(reel.id);
  assert.equal(state.openGaps.find((gap) => gap.id === "gap_open")?.status, "open");
});

test("only an explicit thoughtUpdate changes ThoughtState", async (t) => {
  await withPostgresTestDb(t);
  await resetPrismaClient();
  const { reel } = await createThoughtFromText({
    title: "V03 explicit",
    body: "Материал без обновления.",
    idempotencyKey: "v03-explicit",
  });
  await sendDialogueMessage(reel.id, { text: "Главное — тихий вечер.", idempotencyKey: "v03-explicit-1" }, async () => ({
    text: askQuestionJson("Что ещё важно?"),
    usage: { promptTokens: 1, completionTokens: 1 },
  }));
  const state = await getThoughtState(reel.id);
  assert.equal(state.facts.length, 0);
  assert.equal(state.takeTask, "");
});

test("same turn can suggest_take citing the current answer fact", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  const { reel } = await createThoughtFromText({
    title: "V03 same turn",
    body: "Исходник с одним пробелом.",
    idempotencyKey: "v03-same-turn",
  });
  await applyThoughtState({
    reelId: reel.id,
    expectedRevision: 0,
    patch: { openGaps: [{ id: "gap_last", text: "неясна сцена", status: "open" }] },
  });
  const page = await sendDialogueMessage(
    reel.id,
    { text: "Сцена на кухне вечером.", idempotencyKey: "v03-same-turn-1" },
    async () => {
      const update = await thoughtUpdateForUserText(prisma, reel.id, "Сцена на кухне вечером.", ["gap_last"]);
      return {
        text: JSON.stringify({
          action: "suggest_take",
          mainIdea: "тихий вечер на кухне",
          takeTask: "сказать про кухню спокойно",
          evidenceRefs: [update.factId],
          thoughtUpdate: { fact: update.fact, closeGapIds: update.closeGapIds, answeredGapId: "gap_last" },
        }),
        usage: { promptTokens: 1, completionTokens: 1 },
      };
    },
  );
  assert.ok(page.messages.some((item) => item.body.includes("сказать про кухню")));
  const state = await getThoughtState(reel.id);
  assert.equal(state.facts.length, 1);
  assert.equal(state.facts[0]?.id, `fact_${state.facts[0]?.sourceId}`);
  assert.equal(state.openGaps.find((gap) => gap.id === "gap_last")?.status, "resolved");
  assert.equal(state.takeTask, "сказать про кухню спокойно");
});

test("parallel turns recover without stealing the other call", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  t.after(() => {
    v03TestSeams.afterUserMessageCreate = null;
    v03TestSeams.failThoughtStateApply = null;
  });
  const { reel } = await createThoughtFromText({
    title: "V03 parallel",
    body: "Материал для двух ходов.",
    idempotencyKey: "v03-par",
  });
  let startB: (() => void) | undefined;
  const bGate = new Promise<void>((resolve) => {
    startB = resolve;
  });
  let failedA = false;
  v03TestSeams.afterUserMessageCreate = async () => {
    startB?.();
  };
  v03TestSeams.failThoughtStateApply = async ({ turnKey }) => {
    if (turnKey === "v03-par-a" && !failedA) {
      failedA = true;
      throw new ThoughtStateError("не удалось обновить состояние A", "THOUGHT_STATE_INJECT");
    }
  };
  let callsA = 0;
  let callsB = 0;
  const sendA = sendDialogueMessage(reel.id, { text: "Ответ хода A про вечер.", idempotencyKey: "v03-par-a" }, async () => {
    callsA += 1;
    const update = await thoughtUpdateForUserText(prisma, reel.id, "Ответ хода A про вечер.");
    return { text: askQuestionJson("уточнение A", update), usage: { promptTokens: 1, completionTokens: 1 } };
  });
  const sendB = bGate.then(() =>
    sendDialogueMessage(reel.id, { text: "Ответ хода B про утро.", idempotencyKey: "v03-par-b" }, async () => {
      callsB += 1;
      const update = await thoughtUpdateForUserText(prisma, reel.id, "Ответ хода B про утро.");
      return { text: askQuestionJson("уточнение B", update), usage: { promptTokens: 1, completionTokens: 1 } };
    }),
  );
  const settled = await Promise.allSettled([sendA, sendB]);
  assert.equal(settled[0]?.status, "rejected");
  assert.equal(callsA, 1);
  const thread = await prisma.dialogueThread.findUniqueOrThrow({ where: { reelId: reel.id } });
  const procA = await prisma.dialogueMessage.findFirstOrThrow({
    where: { threadId: thread.id, claimKey: `dialogue-turn:${thread.id}:v03-par-a` },
  });
  const procB = await prisma.dialogueMessage.findFirstOrThrow({
    where: { threadId: thread.id, claimKey: `dialogue-turn:${thread.id}:v03-par-b` },
  });
  const payloadA = JSON.parse(procA.payloadJson) as { aiCallId: string };
  const payloadB = JSON.parse(procB.payloadJson) as { aiCallId: string };
  assert.notEqual(payloadA.aiCallId, payloadB.aiCallId);
  const callA = await prisma.aiCall.findUniqueOrThrow({ where: { id: payloadA.aiCallId } });
  const callB = await prisma.aiCall.findUniqueOrThrow({ where: { id: payloadB.aiCallId } });
  assert.equal(callA.status === "done" && callB.status === "done", false);
  v03TestSeams.afterUserMessageCreate = null;
  v03TestSeams.failThoughtStateApply = null;
  const page = await sendDialogueMessage(
    reel.id,
    { text: "Ответ хода A про вечер.", idempotencyKey: "v03-par-a" },
    async () => {
      callsA += 1;
      return { text: askQuestionJson("не должен вызваться"), usage: { promptTokens: 1, completionTokens: 1 } };
    },
  );
  assert.equal(callsA, 1);
  assert.ok(page.messages.some((item) => item.body.includes("уточнение A")));
  const afterA = await prisma.aiCall.findUniqueOrThrow({ where: { id: payloadA.aiCallId } });
  const afterB = await prisma.aiCall.findUniqueOrThrow({ where: { id: payloadB.aiCallId } });
  assert.equal(afterA.status, "done");
  assert.equal(afterB.id, payloadB.aiCallId);
  const doneA = await prisma.dialogueMessage.findUniqueOrThrow({ where: { id: procA.id } });
  const doneB = await prisma.dialogueMessage.findUniqueOrThrow({ where: { id: procB.id } });
  assert.equal(doneA.status, "done");
  assert.equal(JSON.parse(doneA.payloadJson).aiCallId, payloadA.aiCallId);
  assert.equal(JSON.parse(doneB.payloadJson).aiCallId, payloadB.aiCallId);
});

test("stale ThoughtState mid-flight is not saved", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  const { reel } = await createThoughtFromText({
    title: "V03 stale state",
    body: "Материал для гонки состояния.",
    idempotencyKey: "v03-stale-ts",
  });
  const staleBody = "STALE_THOUGHT_ACTION_MUST_NOT_PERSIST";
  await assert.rejects(
    () =>
      sendDialogueMessage(reel.id, { text: "во время смены состояния", idempotencyKey: "v03-stale-ts-1" }, async () => {
        const live = await getThoughtState(reel.id);
        await applyThoughtState({
          reelId: reel.id,
          expectedRevision: live.revision,
          patch: { intent: "сменили замысел во время ответа" },
        });
        return {
          text: askQuestionJson(staleBody),
          usage: { promptTokens: 1, completionTokens: 1 },
        };
      }),
    (error: unknown) => error instanceof StateVersionError && error.status === 409,
  );
  const page = await (await import("../src/lib/dialogue")).listDialoguePage(reel.id);
  assert.equal(page.messages.some((item) => item.body === staleBody), false);
  const call = await prisma.aiCall.findFirstOrThrow({
    where: { reelId: reel.id, kind: "dialogue" },
    orderBy: { createdAt: "desc" },
  });
  assert.equal(call.status, "error");
  const snap = JSON.parse(call.inputSnapshotJson) as { thoughtStateRevision: number };
  assert.equal(typeof snap.thoughtStateRevision, "number");
});

test("strict action schemas reject extra fields", () => {
  const extras = [
    {
      action: "suggest_take" as const,
      mainIdea: "Идея",
      takeTask: "Записать дубль",
      evidenceRefs: ["fact_1"],
      scriptProposal: "Готовый сценарий",
    },
    {
      action: "ask_question" as const,
      question: "Что главное?",
      clarificationReason: "нужно уточнение",
      whyUnknown: "в материале нет ответа",
      reply: "лишнее поле",
    },
    {
      action: "redirect_to_task" as const,
      currentTask: "вернуться к задаче",
      unknownField: true,
    },
  ];
  for (const payload of extras) {
    assert.throws(
      () => parseAgentAction(payload),
      (error: unknown) => error instanceof AgentActionError && error.code === "AGENT_ACTION_INVALID",
    );
  }
});

test("ask_question accepts an open gap and rejects closed or missing ids", async (t) => {
  await withPostgresTestDb(t);
  await resetPrismaClient();
  const { reel } = await createThoughtFromText({
    title: "V03 gaps",
    body: "Материал с пробелами.",
    idempotencyKey: "v03-gaps",
  });
  await applyThoughtState({
    reelId: reel.id,
    expectedRevision: 0,
    patch: {
      openGaps: [
        { id: "gap_open", text: "неясна сцена", status: "open" },
        { id: "gap_closed", text: "уже закрыто", status: "resolved" },
      ],
    },
  });

  const page = await sendDialogueMessage(reel.id, { text: "уточни сцену", idempotencyKey: "v03-gap-open" }, async () => ({
    text: JSON.stringify({
      action: "ask_question",
      question: "Где происходит сцена?",
      gapId: "gap_open",
      whyUnknown: "в материале места нет",
    }),
    usage: { promptTokens: 1, completionTokens: 1 },
  }));
  assert.ok(page.messages.some((item) => item.body.includes("происходит сцена")));

  await assert.rejects(
    () =>
      sendDialogueMessage(reel.id, { text: "закрытый", idempotencyKey: "v03-gap-closed" }, async () => ({
        text: JSON.stringify({
          action: "ask_question",
          question: "Повторить закрытое?",
          gapId: "gap_closed",
          whyUnknown: "не должно пройти",
        }),
        usage: { promptTokens: 1, completionTokens: 1 },
      })),
    (error: unknown) => error instanceof AgentActionError && error.code === "ACTION_GAP",
  );
  await assert.rejects(
    () =>
      sendDialogueMessage(reel.id, { text: "нет такого", idempotencyKey: "v03-gap-missing" }, async () => ({
        text: JSON.stringify({
          action: "ask_question",
          question: "Пробела нет?",
          gapId: "gap_missing",
          whyUnknown: "не должно пройти",
        }),
        usage: { promptTokens: 1, completionTokens: 1 },
      })),
    (error: unknown) => error instanceof AgentActionError && error.code === "ACTION_GAP",
  );
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
  assert.equal((await getThoughtState(reel.id)).facts.length, 0);
});

test("redirect_to_task with a fact is rejected and does not change state", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  const { reel } = await createThoughtFromText({
    title: "V03 redirect fact reject",
    body: "Задача этой мысли.",
    idempotencyKey: "v03-redir-bad",
  });
  const before = await getThoughtState(reel.id);
  await assert.rejects(
    () =>
      sendDialogueMessage(reel.id, { text: "как сварить кашу", idempotencyKey: "v03-redir-bad-1" }, async () => {
        const update = await thoughtUpdateForUserText(prisma, reel.id, "как сварить кашу");
        return {
          text: JSON.stringify({
            action: "redirect_to_task",
            currentTask: "вернуться к задаче",
            thoughtUpdate: { fact: update.fact, closeGapIds: [] },
          }),
          usage: { promptTokens: 1, completionTokens: 1 },
        };
      }),
    (error: unknown) => error instanceof AgentActionError && error.code === "ACTION_REDIRECT_STATE",
  );
  await assertStateAndActionUnchanged(prisma, reel.id, before, 0);
});

test("closing a different gap than the current question is rejected", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  const { reel } = await createThoughtFromText({
    title: "V03 wrong gap",
    body: "Два пробела.",
    idempotencyKey: "v03-wrong-gap",
  });
  await applyThoughtState({
    reelId: reel.id,
    expectedRevision: 0,
    patch: {
      openGaps: [
        { id: "gap_A", text: "сцена", status: "open" },
        { id: "gap_B", text: "аудитория", status: "open" },
      ],
    },
  });
  await sendDialogueMessage(reel.id, { text: "уточни", idempotencyKey: "v03-wrong-gap-q" }, async () => ({
    text: JSON.stringify({
      action: "ask_question",
      question: "Где сцена?",
      gapId: "gap_A",
      whyUnknown: "места нет",
    }),
    usage: { promptTokens: 1, completionTokens: 1 },
  }));
  const before = await getThoughtState(reel.id);
  const actionsBefore = (await committedAssistantActions(prisma, reel.id)).length;
  await assert.rejects(
    () =>
      sendDialogueMessage(reel.id, { text: "Сцена на кухне.", idempotencyKey: "v03-wrong-gap-a" }, async () => {
        const update = await thoughtUpdateForUserText(prisma, reel.id, "Сцена на кухне.", ["gap_B"]);
        return {
          text: askQuestionJson("ещё вопрос", { fact: update.fact, closeGapIds: ["gap_B"] }),
          usage: { promptTokens: 1, completionTokens: 1 },
        };
      }),
    (error: unknown) => error instanceof AgentActionError && error.code === "ACTION_GAP",
  );
  await assertStateAndActionUnchanged(prisma, reel.id, before, actionsBefore);
});

test("closing several unrelated gaps in one answer is rejected", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  const { reel } = await createThoughtFromText({
    title: "V03 many gaps",
    body: "Два пробела.",
    idempotencyKey: "v03-many-gaps",
  });
  await applyThoughtState({
    reelId: reel.id,
    expectedRevision: 0,
    patch: {
      openGaps: [
        { id: "gap_A", text: "сцена", status: "open" },
        { id: "gap_B", text: "аудитория", status: "open" },
      ],
    },
  });
  const before = await getThoughtState(reel.id);
  await assert.rejects(
    () =>
      sendDialogueMessage(reel.id, { text: "Сцена на кухне вечером.", idempotencyKey: "v03-many-gaps-a" }, async () => ({
        text: JSON.stringify({
          action: "ask_question",
          question: "Что ещё?",
          clarificationReason: "нужно уточнение",
          whyUnknown: "мало данных",
          thoughtUpdate: {
            fact: { text: "Сцена на кухне вечером.", sourceType: "dialogue_message", sourceId: "x" },
            closeGapIds: ["gap_A", "gap_B"],
          },
        }),
        usage: { promptTokens: 1, completionTokens: 1 },
      })),
    (error: unknown) => error instanceof AgentActionError && error.code === "ACTION_GAP",
  );
  await assertStateAndActionUnchanged(prisma, reel.id, before, 0);
});

test("bind interrupt reuses one AiCall across two executors", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  t.after(() => {
    v03TestSeams.afterAiCallBeforeBind = null;
  });
  const { reel } = await createThoughtFromText({
    title: "V03 bind",
    body: "Материал для привязки хода.",
    idempotencyKey: "v03-bind",
  });
  v03TestSeams.afterAiCallBeforeBind = async () => {
    throw new Error("bind interrupt");
  };
  let completeCalls = 0;
  await assert.rejects(
    () =>
      sendDialogueMessage(reel.id, { text: "Главное — тихий вечер.", idempotencyKey: "v03-bind-1" }, async () => {
        completeCalls += 1;
        return { text: askQuestionJson("не должен"), usage: { promptTokens: 1, completionTokens: 1 } };
      }),
    /bind interrupt/,
  );
  assert.equal(completeCalls, 0);
  assert.equal(await prisma.aiCall.count({ where: { reelId: reel.id, kind: "dialogue" } }), 1);
  const thread = await prisma.dialogueThread.findUniqueOrThrow({ where: { reelId: reel.id } });
  const user = await prisma.dialogueMessage.findFirstOrThrow({
    where: { threadId: thread.id, idempotencyKey: "v03-bind-1" },
  });
  v03TestSeams.afterAiCallBeforeBind = null;
  const [one, two] = await Promise.all([
    ensureDialogueTurnBinding({
      reelId: reel.id,
      threadId: thread.id,
      userMessageId: user.id,
      key: "v03-bind-1",
      text: "Главное — тихий вечер.",
    }),
    ensureDialogueTurnBinding({
      reelId: reel.id,
      threadId: thread.id,
      userMessageId: user.id,
      key: "v03-bind-1",
      text: "Главное — тихий вечер.",
    }),
  ]);
  assert.equal(one.call.id, two.call.id);
  assert.equal(await prisma.aiCall.count({ where: { reelId: reel.id, kind: "dialogue" } }), 1);
  const page = await sendDialogueMessage(
    reel.id,
    { text: "Главное — тихий вечер.", idempotencyKey: "v03-bind-1" },
    async () => {
      completeCalls += 1;
      const update = await thoughtUpdateForUserText(prisma, reel.id, "Главное — тихий вечер.");
      return { text: askQuestionJson("Что ещё?", update), usage: { promptTokens: 1, completionTokens: 1 } };
    },
  );
  assert.equal(completeCalls, 1);
  assert.ok(page.messages.some((item) => item.body.includes("Что ещё")));
  assert.equal(await prisma.aiCall.count({ where: { reelId: reel.id, kind: "dialogue" } }), 1);
});

test("answeredGapId that disagrees with closeGapIds is rejected", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  const { reel } = await createThoughtFromText({
    title: "V03 answered mismatch",
    body: "Два пробела.",
    idempotencyKey: "v03-ans-mis",
  });
  await applyThoughtState({
    reelId: reel.id,
    expectedRevision: 0,
    patch: {
      openGaps: [
        { id: "gap_A", text: "сцена", status: "open" },
        { id: "gap_B", text: "аудитория", status: "open" },
      ],
    },
  });
  await sendDialogueMessage(reel.id, { text: "уточни", idempotencyKey: "v03-ans-mis-q" }, async () => ({
    text: JSON.stringify({
      action: "ask_question",
      question: "Где сцена?",
      gapId: "gap_A",
      whyUnknown: "места нет",
    }),
    usage: { promptTokens: 1, completionTokens: 1 },
  }));
  const before = await getThoughtState(reel.id);
  const actionsBefore = (await committedAssistantActions(prisma, reel.id)).length;
  await assert.rejects(
    () =>
      sendDialogueMessage(reel.id, { text: "Сцена на кухне.", idempotencyKey: "v03-ans-mis-a" }, async () => {
        const update = await thoughtUpdateForUserText(prisma, reel.id, "Сцена на кухне.", ["gap_A"]);
        return {
          text: askQuestionJson("ещё вопрос", {
            fact: update.fact,
            closeGapIds: ["gap_A"],
            answeredGapId: "gap_B",
          }),
          usage: { promptTokens: 1, completionTokens: 1 },
        };
      }),
    (error: unknown) => error instanceof AgentActionError && error.code === "ACTION_GAP",
  );
  await assertStateAndActionUnchanged(prisma, reel.id, before, actionsBefore);
});

test("same idempotency key with different text is rejected", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  const { reel } = await createThoughtFromText({
    title: "V03 idemp text",
    body: "Материал.",
    idempotencyKey: "v03-idemp-text",
  });
  await sendDialogueMessage(reel.id, { text: "Первый текст хода.", idempotencyKey: "v03-idemp-1" }, async () => ({
    text: askQuestionJson("Что ещё?"),
    usage: { promptTokens: 1, completionTokens: 1 },
  }));
  const before = await getThoughtState(reel.id);
  const actionsBefore = (await committedAssistantActions(prisma, reel.id)).length;
  await assert.rejects(
    () =>
      sendDialogueMessage(reel.id, { text: "Другой текст того же ключа.", idempotencyKey: "v03-idemp-1" }, async () => ({
        text: askQuestionJson("не должен"),
        usage: { promptTokens: 1, completionTokens: 1 },
      })),
    (error: unknown) => error instanceof DialogueError && error.code === "IDEMPOTENCY_CONFLICT",
  );
  await assertStateAndActionUnchanged(prisma, reel.id, before, actionsBefore);
});

test("two executors of one turnKey call complete once", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  const { reel } = await createThoughtFromText({
    title: "V03 lease race",
    body: "Материал для lease.",
    idempotencyKey: "v03-lease-race",
  });
  let completeCalls = 0;
  const complete = async () => {
    completeCalls += 1;
    await delay(80);
    const update = await thoughtUpdateForUserText(prisma, reel.id, "Главное — тихий вечер.");
    return { text: askQuestionJson("Один ответ модели", update), usage: { promptTokens: 1, completionTokens: 1 } };
  };
  const input = { text: "Главное — тихий вечер.", idempotencyKey: "v03-lease-1" };
  const [one, two] = await Promise.all([runDialogueTurn(reel.id, input, complete), runDialogueTurn(reel.id, input, complete)]);
  assert.equal(completeCalls, 1);
  assert.equal(await prisma.aiCall.count({ where: { reelId: reel.id, kind: "dialogue" } }), 1);
  const thread = await prisma.dialogueThread.findUniqueOrThrow({ where: { reelId: reel.id } });
  assert.equal(await prisma.dialogueMessage.count({ where: { threadId: thread.id, claimKey: turnClaimKey(thread.id, "v03-lease-1") } }), 1);
  assert.ok(one.messages.some((item) => item.body.includes("Один ответ модели")));
  assert.ok(two.messages.some((item) => item.body.includes("Один ответ модели")));
});

test("saved responseText is reused without a second model call", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  t.after(() => {
    v03TestSeams.afterClaimBeforeComplete = null;
  });
  const { reel } = await createThoughtFromText({
    title: "V03 saved response",
    body: "Материал.",
    idempotencyKey: "v03-saved-resp",
  });
  v03TestSeams.afterClaimBeforeComplete = async ({ callId }) => {
    await prisma.aiCall.update({
      where: { id: callId },
      data: { responseText: askQuestionJson("сохранённый ответ") },
    });
    throw new Error("stop before complete");
  };
  let completeCalls = 0;
  const interrupted = await runDialogueTurn(
    reel.id,
    { text: "Главное — тихий вечер.", idempotencyKey: "v03-saved-1" },
    async () => {
      completeCalls += 1;
      return { text: askQuestionJson("не должен"), usage: { promptTokens: 1, completionTokens: 1 } };
    },
  );
  assert.equal(completeCalls, 0);
  assert.ok(interrupted.messages.some((item) => item.kind === "error" || item.status === "error"));
  v03TestSeams.afterClaimBeforeComplete = null;
  const page = await runDialogueTurn(
    reel.id,
    { text: "Главное — тихий вечер.", idempotencyKey: "v03-saved-1" },
    async () => {
      completeCalls += 1;
      return { text: askQuestionJson("не должен"), usage: { promptTokens: 1, completionTokens: 1 } };
    },
  );
  assert.equal(completeCalls, 0);
  assert.ok(page.messages.some((item) => item.body.includes("сохранённый ответ")));
  assert.equal(await prisma.aiCall.count({ where: { reelId: reel.id, kind: "dialogue" } }), 1);
});

test("expired lease lets a second executor finish and fences the first write", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  t.after(() => {
    v03TestSeams.afterClaimBeforeComplete = null;
  });
  const { reel } = await createThoughtFromText({
    title: "V03 lease expire",
    body: "Материал.",
    idempotencyKey: "v03-lease-exp",
  });
  let releaseFirst: (() => void) | undefined;
  const holdFirst = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let firstClaimed: (() => void) | undefined;
  const sawFirstClaim = new Promise<void>((resolve) => {
    firstClaimed = resolve;
  });
  let claims = 0;
  v03TestSeams.afterClaimBeforeComplete = async ({ callId }) => {
    claims += 1;
    if (claims === 1) {
      await prisma.aiCall.update({
        where: { id: callId },
        data: { execLeaseUntil: new Date(Date.now() - 5_000) },
      });
      firstClaimed?.();
      await holdFirst;
    }
  };
  let completeCalls = 0;
  const complete = async () => {
    completeCalls += 1;
    const update = await thoughtUpdateForUserText(prisma, reel.id, "Главное — тихий вечер.");
    return {
      text: askQuestionJson(completeCalls === 1 ? "ответ второго" : "ответ просроченного", update),
      usage: { promptTokens: 1, completionTokens: 1 },
    };
  };
  const input = { text: "Главное — тихий вечер.", idempotencyKey: "v03-lease-exp-1" };
  const first = runDialogueTurn(reel.id, input, complete);
  await sawFirstClaim;
  const secondPage = await runDialogueTurn(reel.id, input, complete);
  releaseFirst?.();
  const firstPage = await first;
  assert.equal(completeCalls, 2);
  assert.equal(await prisma.aiCall.count({ where: { reelId: reel.id, kind: "dialogue" } }), 1);
  const stored = await prisma.aiCall.findFirstOrThrow({ where: { reelId: reel.id, kind: "dialogue" } });
  assert.match(stored.responseText ?? "", /ответ второго/);
  assert.ok(secondPage.messages.some((item) => item.body.includes("ответ второго")));
  assert.ok(firstPage.messages.some((item) => item.body.includes("ответ второго")));
});

test("two executors colliding on commit keep the successful processing message", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  t.after(() => {
    v03TestSeams.beforeCommitDialogueReply = null;
  });
  const { reel } = await createThoughtFromText({
    title: "V03 commit race",
    body: "Материал для записи хода.",
    idempotencyKey: "v03-commit-race",
  });
  let releaseBarrier: (() => void) | undefined;
  const barrier = new Promise<void>((resolve) => {
    releaseBarrier = resolve;
  });
  let waiting = 0;
  let firstWaiting: (() => void) | undefined;
  const sawFirst = new Promise<void>((resolve) => {
    firstWaiting = resolve;
  });
  let bothWaiting: (() => void) | undefined;
  const sawBoth = new Promise<void>((resolve) => {
    bothWaiting = resolve;
  });
  v03TestSeams.beforeCommitDialogueReply = async ({ processingId }) => {
    waiting += 1;
    if (waiting === 1) firstWaiting?.();
    if (waiting === 2) bothWaiting?.();
    await barrier;
    const row = await prisma.dialogueMessage.findUniqueOrThrow({ where: { id: processingId } });
    if (row.status === "done" && (row.kind === "question" || row.kind === "text")) {
      throw new StateVersionError();
    }
  };
  let completeCalls = 0;
  const complete = async () => {
    completeCalls += 1;
    const update = await thoughtUpdateForUserText(prisma, reel.id, "Главное — тихий вечер.");
    return { text: askQuestionJson("Итог одного хода", update), usage: { promptTokens: 1, completionTokens: 1 } };
  };
  const input = { text: "Главное — тихий вечер.", idempotencyKey: "v03-commit-1" };
  const firstRun = runDialogueTurn(reel.id, input, complete);
  await sawFirst;
  const secondRun = runDialogueTurn(reel.id, input, complete);
  await sawBoth;
  assert.equal(waiting, 2);
  releaseBarrier?.();
  const [one, two] = await Promise.all([firstRun, secondRun]);
  const thread = await prisma.dialogueThread.findUniqueOrThrow({ where: { reelId: reel.id } });
  const processing = await prisma.dialogueMessage.findFirstOrThrow({
    where: { threadId: thread.id, claimKey: turnClaimKey(thread.id, "v03-commit-1") },
  });
  assert.equal(processing.status, "done");
  assert.equal(processing.kind, "question");
  assert.match(processing.body, /Итог одного хода/);
  assert.equal(
    await prisma.dialogueMessage.count({
      where: { threadId: thread.id, role: "assistant", kind: "error" },
    }),
    0,
  );
  assert.equal((await prisma.aiCall.findFirstOrThrow({ where: { reelId: reel.id, kind: "dialogue" } })).status, "done");
  assert.equal(completeCalls, 1);
  assert.ok(one.messages.some((item) => item.body.includes("Итог одного хода")));
  assert.ok(two.messages.some((item) => item.body.includes("Итог одного хода")));
  assert.ok(!one.messages.some((item) => item.kind === "error"));
  assert.ok(!two.messages.some((item) => item.kind === "error"));
});

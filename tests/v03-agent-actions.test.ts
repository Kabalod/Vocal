import assert from "node:assert/strict";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";
import { AgentActionError, parseAgentAction } from "../src/lib/agent-action";
import { sendDialogueMessage } from "../src/lib/dialogue";
import { createTake } from "../src/lib/reels";
import { createThoughtFromText } from "../src/lib/thought-create";
import { applyThoughtState, getThoughtState } from "../src/lib/thought-state";
import { StateVersionError } from "../src/lib/ai/usage-guard";
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
});

test("user reply becomes a fact and then suggest_take can cite it", async (t) => {
  await withPostgresTestDb(t);
  await resetPrismaClient();
  const { reel } = await createThoughtFromText({
    title: "V03 user fact",
    body: "Исходник без фактов диалога.",
    idempotencyKey: "v03-user-fact",
  });
  const empty = await getThoughtState(reel.id);
  assert.equal(empty.facts.length, 0);
  assert.equal(empty.openGaps.length, 0);

  await sendDialogueMessage(reel.id, { text: "Главное — тихий вечер.", idempotencyKey: "v03-user-fact-1" }, async () => ({
    text: askQuestionJson("Что ещё важно сказать?"),
    usage: { promptTokens: 1, completionTokens: 1 },
  }));
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
});

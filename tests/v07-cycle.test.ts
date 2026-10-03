import assert from "node:assert/strict";
import { test } from "node:test";
import { StateVersionError } from "../src/lib/ai/usage-guard";
import { c00ClassifySeam } from "../src/lib/c00-classify-signal";
import { resetPrismaClient } from "../src/lib/db";
import { sendDialogueMessage } from "../src/lib/dialogue";
import { createTake, getReel, updateReel } from "../src/lib/reels";
import { createThoughtFromText } from "../src/lib/thought-create";
import { applyThoughtState, getThoughtState } from "../src/lib/thought-state";
import { createEditedRevision, saveOriginalIfAbsent } from "../src/lib/transcripts";
import { v01TestSeams } from "../src/lib/v01-test-seams";
import { FIXTURE_CRAFT_CATALOG, v07CraftSeam } from "../src/lib/v07-craft/catalog";
import { askQuestionJson, suggestTakeJson, thoughtUpdateForUserText } from "./helpers/agent-action-json";
import { withPostgresTestDb } from "./helpers/postgres-test-db";

test("synthetic full cycle with craft, correction, several takes, conflict, and model fault", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  t.after(() => {
    v07CraftSeam.enabled = null;
    v07CraftSeam.catalog = null;
    c00ClassifySeam.useInjectedComplete = false;
    v01TestSeams.afterWorkingTakeRead = null;
  });
  v07CraftSeam.catalog = FIXTURE_CRAFT_CATALOG;
  c00ClassifySeam.useInjectedComplete = true;

  const { reel } = await createThoughtFromText({
    title: "V07 cycle",
    body: "Хочу рассказать, как вечером на кухне стало тихо.",
    idempotencyKey: "v07-cycle-create",
  });
  const originId = reel.workingTakeId;
  assert.ok(originId);
  await applyThoughtState({
    reelId: reel.id,
    expectedRevision: 0,
    patch: {
      intent: "личная история про тихий вечер",
      openGaps: [{ id: "gap_example", text: "Какой один случай произнести", status: "open" }],
    },
  });
  assert.deepEqual((await getThoughtState(reel.id)).facts, []);

  await sendDialogueMessage(reel.id, { text: "уточни", idempotencyKey: "v07-cycle-q1" }, async () => ({
    text: JSON.stringify({
      action: "ask_question",
      question: "Какой один вечер вы хотите произнести?",
      gapId: "gap_example",
      whyUnknown: "в исходнике нет одного выбранного случая",
    }),
    usage: { promptTokens: 1, completionTokens: 1 },
  }));

  await sendDialogueMessage(
    reel.id,
    { text: "Вечер на кухне, когда выключили воду.", idempotencyKey: "v07-cycle-a1" },
    async () => {
      const update = await thoughtUpdateForUserText(prisma, reel.id, "Вечер на кухне, когда выключили воду.", [
        "gap_example",
      ]);
      return {
        text: suggestTakeJson("Произнести этот вечер целиком, без морали.", [update.factId], {
          fact: update.fact,
          closeGapIds: update.closeGapIds,
          answeredGapId: "gap_example",
        }),
        usage: { promptTokens: 1, completionTokens: 1 },
      };
    },
  );
  const afterAnswer = await getThoughtState(reel.id);
  assert.equal(afterAnswer.takeTask, "Произнести этот вечер целиком, без морали.");
  assert.equal(afterAnswer.openGaps.find((gap) => gap.id === "gap_example")?.status, "resolved");
  assert.equal(afterAnswer.facts.some((fact) => fact.text.includes("кухне")), true);

  await applyThoughtState({
    reelId: reel.id,
    expectedRevision: afterAnswer.revision,
    patch: {
      facts: [
        ...afterAnswer.facts,
        { id: "fact_wrong", text: "Автор любит шумные вечеринки.", sourceType: "initial_note", sourceId: reel.id },
      ],
    },
  });
  await sendDialogueMessage(reel.id, { text: "Я этого не говорил.", idempotencyKey: "v07-cycle-c00" }, async (input) => {
    if (input.label === "c00_classify") {
      return {
        text: JSON.stringify({ signal: { signalType: "author_negation", targetId: "fact_wrong" } }),
        usage: { promptTokens: 1, completionTokens: 1 },
      };
    }
    return { text: askQuestionJson("Какая тогда ваша позиция про тот вечер?"), usage: { promptTokens: 1, completionTokens: 1 } };
  });
  assert.equal((await getThoughtState(reel.id)).facts.some((fact) => fact.id === "fact_wrong"), false);

  const firstTake = await createTake(reel.id, { inputType: "audio", bodyText: "", originalName: "one.webm" });
  const secondTake = await createTake(reel.id, { inputType: "audio", bodyText: "", originalName: "two.webm" });
  await saveOriginalIfAbsent(firstTake.id, { text: "Первый дубль: кухня, выключили воду.", source: "stt" });
  await saveOriginalIfAbsent(secondTake.id, { text: "Второй дубль: тишина после того, как выключили воду.", source: "stt" });
  assert.equal((await getReel(reel.id))?.workingTakeId, secondTake.id);

  await sendDialogueMessage(reel.id, { text: "разбери второй дубль", idempotencyKey: "v07-cycle-review" }, async () => ({
    text: JSON.stringify({
      action: "content_sufficient",
      checkedInTranscript: "тишина после воды",
      whyNoGaps: "замысел донесён во втором дубле",
    }),
    usage: { promptTokens: 1, completionTokens: 1 },
  }));

  v01TestSeams.afterWorkingTakeRead = async () => {
    await createEditedRevision(secondTake.id, "CHANGED_AFTER_FREEZE");
  };
  await assert.rejects(
    () =>
      sendDialogueMessage(reel.id, { text: "конфликт снимка", idempotencyKey: "v07-cycle-409" }, async () => ({
        text: askQuestionJson("Что изменилось?"),
        usage: { promptTokens: 1, completionTokens: 1 },
      })),
    (error: unknown) => error instanceof StateVersionError,
  );
  v01TestSeams.afterWorkingTakeRead = null;
  assert.ok(await prisma.dialogueMessage.findFirst({ where: { body: "конфликт снимка", role: "user" } }));

  const faultPage = await sendDialogueMessage(
    reel.id,
    { text: "повтор после ошибки модели", idempotencyKey: "v07-cycle-fail" },
    async () => {
      throw new Error("mock model down");
    },
  );
  assert.ok(faultPage.messages.some((row) => row.body === "повтор после ошибки модели"));
  assert.ok(faultPage.messages.some((row) => row.kind === "error" && row.body.includes("mock model down")));
  const afterFault = await getThoughtState(reel.id);
  assert.equal(afterFault.takeTask, "Произнести этот вечер целиком, без морали.");

  await prisma.reel.update({ where: { id: reel.id }, data: { workingTakeId: secondTake.id } });
  const chosen = await updateReel(reel.id, { finalTakeId: secondTake.id });
  assert.equal(chosen.finalTakeId, secondTake.id);
  assert.equal(chosen.finalScriptId, null);
  const completed = await updateReel(reel.id, { status: "completed" });
  assert.equal(completed.status, "completed");
  assert.equal(completed.finalScriptId, null);
  assert.equal((await getReel(reel.id))?.workingTakeId, secondTake.id);
});

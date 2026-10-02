import { prisma } from "@/lib/db";
import { ownerUserId } from "@/lib/auth/session";
import { ReelError } from "@/lib/reels";
import { StateVersionError } from "@/lib/ai/usage-guard";
import { v01TestSeams } from "@/lib/v01-test-seams";
import type { Prisma } from "@prisma/client";
import { actionMessage, assertAgentActionAllowed, type AgentAction, type ThoughtUpdate } from "@/lib/agent-action";
import { allowsThoughtStatePatch, routeC00Decision } from "@/lib/c00-router";
import { priorDecisionIdForTarget, resolveC00Correction, resolveC00CorrectionTarget } from "@/lib/c00-correction";
import type { C00SignalCandidate } from "@/lib/c00-signal";
import { applyThoughtStateInTx, buildDialogueThoughtPatch, parseThoughtStateLists } from "@/lib/thought-state";
import {
  assertEnvelopeMatchesCall,
  buildC00Envelope,
  C00EnvelopeError,
  listAcceptedC00Corrections,
  parseC00Envelope,
  readThoughtAction,
  sameThoughtAction,
  thoughtDialogueTurnKey,
  type C00Correction,
  type C00Decision,
} from "@/lib/c00-envelope";
import { DialogueTurnExecError } from "@/lib/dialogue-exec";
import { v03TestSeams } from "@/lib/v03-test-seams";

export type DialogueMaterialSnapshot = {
  workingTakeId: string;
  transcriptRevisionId: string | null;
  reelUpdatedAt: string;
  thoughtStateRevision: number;
  dialogueVersion: {
    threadId: string;
    messageCount: number;
    lastMessageId: string | null;
    headEpoch: number;
  };
};

export async function requireWorkingTake(reelId: string) {
  const reel = await prisma.reel.findFirst({
    where: { id: reelId, ownerUserId: ownerUserId() },
    select: {
      id: true,
      title: true,
      workingTakeId: true,
      selectedScriptId: true,
      updatedAt: true,
      finalTakeId: true,
    },
  });
  if (!reel) throw new ReelError("Карточка не найдена.", "REEL_NOT_FOUND", 404);
  if (!reel.workingTakeId) {
    throw new ReelError("Нужен явный рабочий дубль.", "WORKING_TAKE_REQUIRED", 409);
  }
  const take = await prisma.take.findFirst({
    where: { id: reel.workingTakeId, reelId },
  });
  if (!take) {
    throw new ReelError("Рабочий дубль должен принадлежать этой карточке.", "TAKE_NOT_IN_REEL");
  }
  return { reel, take };
}

export async function readDialogueVersion(threadId: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  const [thread, messageCount, last] = await Promise.all([
    db.dialogueThread.findUnique({ where: { id: threadId }, select: { headEpoch: true } }),
    db.dialogueMessage.count({ where: { threadId } }),
    db.dialogueMessage.findFirst({
      where: { threadId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
    }),
  ]);
  if (!thread) {
    throw new ReelError("Диалог не найден.", "REEL_NOT_FOUND", 404);
  }
  return {
    threadId,
    messageCount,
    lastMessageId: last?.id ?? null,
    headEpoch: thread.headEpoch,
  };
}

export function snapshotFromLoaded(
  reel: { updatedAt: Date },
  take: { id: string; selectedTranscriptId: string | null },
  dialogueVersion: DialogueMaterialSnapshot["dialogueVersion"],
  thoughtStateRevision: number,
): DialogueMaterialSnapshot {
  return {
    workingTakeId: take.id,
    transcriptRevisionId: take.selectedTranscriptId,
    reelUpdatedAt: reel.updatedAt.toISOString(),
    thoughtStateRevision,
    dialogueVersion,
  };
}

export function isCommittedAssistantTurn(row: { status: string; kind: string }) {
  return row.status === "done" && (row.kind === "question" || row.kind === "text");
}

export function materialSnapshotChanged(
  current: DialogueMaterialSnapshot,
  snapshot: DialogueMaterialSnapshot,
): boolean {
  return (
    current.workingTakeId !== snapshot.workingTakeId ||
    current.transcriptRevisionId !== snapshot.transcriptRevisionId ||
    current.reelUpdatedAt !== snapshot.reelUpdatedAt ||
    current.dialogueVersion.threadId !== snapshot.dialogueVersion.threadId ||
    current.dialogueVersion.messageCount !== snapshot.dialogueVersion.messageCount ||
    current.dialogueVersion.lastMessageId !== snapshot.dialogueVersion.lastMessageId ||
    current.dialogueVersion.headEpoch !== snapshot.dialogueVersion.headEpoch ||
    current.thoughtStateRevision !== snapshot.thoughtStateRevision
  );
}

export async function readMaterialSnapshot(
  reelId: string,
  threadId: string,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<DialogueMaterialSnapshot> {
  const reel = await db.reel.findFirst({
    where: { id: reelId, ownerUserId: ownerUserId() },
    select: { id: true, workingTakeId: true, updatedAt: true },
  });
  if (!reel?.workingTakeId) {
    throw new ReelError("Нужен явный рабочий дубль.", "WORKING_TAKE_REQUIRED", 409);
  }
  const take = await db.take.findFirst({
    where: { id: reel.workingTakeId, reelId },
    select: { id: true, selectedTranscriptId: true },
  });
  if (!take) {
    throw new ReelError("Рабочий дубль должен принадлежать этой карточке.", "TAKE_NOT_IN_REEL");
  }
  const thought = await db.thoughtState.findFirst({
    where: { reelId, reel: { ownerUserId: ownerUserId() } },
    select: { revision: true },
  });
  if (!thought) {
    throw new ReelError("Состояние мысли не найдено.", "THOUGHT_STATE_NOT_FOUND", 404);
  }
  return snapshotFromLoaded(reel, take, await readDialogueVersion(threadId, db), thought.revision);
}

export async function commitDialogueReply(input: {
  reelId: string;
  threadId: string;
  snapshot: DialogueMaterialSnapshot;
  callId: string;
  processingId: string;
  userMessageId: string;
  turnKey: string;
  action: AgentAction;
  thoughtUpdate: ThoughtUpdate;
  rawText: string;
  promptTokens: number | null;
  completionTokens: number | null;
  execOwnerId?: string | null;
  execGeneration?: number | null;
  c00Signal?: C00SignalCandidate | null;
  freezeThoughtSlice?: boolean;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "DialogueThread" WHERE id = ${input.threadId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Reel" WHERE id = ${input.reelId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Take" WHERE id = ${input.snapshot.workingTakeId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "ThoughtState" WHERE "reelId" = ${input.reelId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "DialogueMessage" WHERE id = ${input.processingId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "AiCall" WHERE id = ${input.callId} FOR UPDATE`;
    const processingRow = await tx.dialogueMessage.findUniqueOrThrow({ where: { id: input.processingId } });
    if (isCommittedAssistantTurn(processingRow)) {
      return;
    }
    const call = await tx.aiCall.findUniqueOrThrow({ where: { id: input.callId } });
    const expectedTurnKey = thoughtDialogueTurnKey(input.threadId, input.turnKey);
    if (call.turnKey !== expectedTurnKey || call.reelId !== input.reelId || call.ownerUserId !== ownerUserId()) {
      throw new C00EnvelopeError("Конверт не совпадает с вызовом хода.", "C00_ENVELOPE_MISMATCH");
    }
    const hasLeaseClaim = input.execOwnerId != null && input.execGeneration != null;
    const restoringSavedResponse = call.responseText != null && input.rawText === call.responseText;
    if (hasLeaseClaim) {
      if (call.execOwnerId !== input.execOwnerId || call.execGeneration !== input.execGeneration) {
        throw new DialogueTurnExecError("Результат хода уже записан другим исполнителем.", "TURN_FENCE");
      }
    } else if (!restoringSavedResponse) {
      throw new C00EnvelopeError(
        "Нельзя записать ход без владельца lease или точного сохранённого ответа.",
        "C00_LEASE_OR_RESTORE",
      );
    }
    if (call.responseText != null && !restoringSavedResponse) {
      throw new C00EnvelopeError("Текст ответа не совпадает с сохранённым.", "C00_RESPONSE_MISMATCH");
    }
    const existingEnvelope = parseC00Envelope(call.resultJson);
    if (existingEnvelope) assertEnvelopeMatchesCall(existingEnvelope, call);

    const finishProcessing = async (action: AgentAction) => {
      const message = actionMessage(action);
      const priorRow = await tx.dialogueMessage.findUniqueOrThrow({ where: { id: input.processingId } });
      let priorPayload: Record<string, unknown> = {};
      try {
        priorPayload = JSON.parse(priorRow.payloadJson) as Record<string, unknown>;
      } catch {
        priorPayload = {};
      }
      await tx.dialogueMessage.update({
        where: { id: input.processingId },
        data: {
          kind: message.kind,
          body: message.body,
          payloadJson: JSON.stringify({
            ...priorPayload,
            action,
            thoughtUpdate: input.thoughtUpdate,
            userMessageId: input.userMessageId,
            aiCallId: input.callId,
            idempotencyKey: input.turnKey,
          }),
          status: "done",
        },
      });
    };

    if (call.status === "done") {
      if (!restoringSavedResponse) {
        throw new C00EnvelopeError("Текст ответа не совпадает с сохранённым.", "C00_RESPONSE_MISMATCH");
      }
      const storedAction = readThoughtAction(call.resultJson);
      if (!storedAction) {
        throw new C00EnvelopeError("Сохранённый результат хода повреждён.", "C00_RESULT_CORRUPT");
      }
      if (!sameThoughtAction(storedAction, input.action)) {
        throw new C00EnvelopeError("Действие не совпадает с сохранённым результатом хода.", "C00_ACTION_MISMATCH");
      }
      await finishProcessing(storedAction);
      return;
    }

    const matches = async () => {
      const current = await readMaterialSnapshot(input.reelId, input.threadId, tx);
      return !materialSnapshotChanged(current, input.snapshot);
    };

    if (!(await matches())) {
      const latest = await tx.dialogueMessage.findUniqueOrThrow({ where: { id: input.processingId } });
      if (isCommittedAssistantTurn(latest)) return;
      const latestCall = await tx.aiCall.findUniqueOrThrow({ where: { id: input.callId } });
      if (latestCall.status === "done" && (parseC00Envelope(latestCall.resultJson) || readThoughtAction(latestCall.resultJson))) {
        return;
      }
      throw new StateVersionError();
    }
    if (v01TestSeams.afterMaterialCheck) await v01TestSeams.afterMaterialCheck();
    if (!(await matches())) throw new StateVersionError();
    if (v01TestSeams.afterLastMaterialCheck) await v01TestSeams.afterLastMaterialCheck();

    const take = await tx.take.findFirst({
      where: { id: input.snapshot.workingTakeId, reelId: input.reelId },
      select: { id: true, inputType: true, selectedTranscriptId: true },
    });
    if (!take) throw new ReelError("Рабочий дубль должен принадлежать этой карточке.", "TAKE_NOT_IN_REEL");

    const userMessage = await tx.dialogueMessage.findUniqueOrThrow({
      where: { id: input.userMessageId },
      select: { id: true, createdAt: true, body: true },
    });
    const priorAsk = await tx.dialogueMessage.findFirst({
      where: {
        threadId: input.threadId,
        role: "assistant",
        status: "done",
        kind: "question",
        createdAt: { lt: userMessage.createdAt },
      },
      orderBy: { createdAt: "desc" },
      select: { payloadJson: true },
    });
    let pendingGapId: string | null = null;
    try {
      const payload = JSON.parse(priorAsk?.payloadJson ?? "{}") as { action?: { gapId?: string } };
      pendingGapId = payload.action?.gapId?.trim() || null;
    } catch {
      pendingGapId = null;
    }
    const state = await tx.thoughtState.findFirst({
      where: { reelId: input.reelId, reel: { ownerUserId: ownerUserId() } },
    });
    if (!state) throw new ReelError("Состояние мысли не найдено.", "THOUGHT_STATE_NOT_FOUND", 404);
    if (state.revision !== input.snapshot.thoughtStateRevision) throw new StateVersionError();
    const routed = existingEnvelope
      ? {
          decision: existingEnvelope.decision,
          applyThoughtUpdate: false,
        }
      : routeC00Decision({
          candidate: input.c00Signal ?? null,
          ownerUserId: ownerUserId(),
          callOwnerUserId: call.ownerUserId,
          currentUserMessageId: input.userMessageId,
          thoughtStateRevision: input.snapshot.thoughtStateRevision,
          callId: call.id,
          userText: userMessage.body,
        });
    const lists = parseThoughtStateLists(state);
    let decision: C00Decision | null = routed.decision;
    let correction: C00Correction | null = existingEnvelope?.correction ?? null;
    let patch = null;
    if (!existingEnvelope && decision?.action === "correct_thought") {
      const prior = listAcceptedC00Corrections(
        await tx.aiCall.findMany({
          where: { reelId: input.reelId, kind: "dialogue", status: "done" },
          select: { id: true, resultJson: true },
        }),
      );
      const target = resolveC00CorrectionTarget({
        candidate: input.c00Signal ?? null,
        facts: lists.facts,
        openGaps: lists.openGaps,
        thoughtUpdate: input.thoughtUpdate,
        signalType: decision.signalType,
      });
      const resolved = resolveC00Correction({
        decision,
        candidate: input.c00Signal ?? null,
        facts: lists.facts,
        openGaps: lists.openGaps,
        thoughtUpdate: input.thoughtUpdate,
        currentUserMessageId: userMessage.id,
        priorDecisionIdOnTarget: target
          ? priorDecisionIdForTarget(
              prior.map((item) => ({
                decisionId: item.correction.decisionId,
                targetKind: item.correction.targetKind,
                targetId: item.correction.targetId,
              })),
              target,
            )
          : null,
        acceptedAt: "",
      });
      if (resolved) {
        decision = resolved.decision;
        correction = { ...resolved.correction, acceptedAt: "" };
        patch = resolved.patch;
      }
    } else if (
      !existingEnvelope &&
      !input.freezeThoughtSlice &&
      allowsThoughtStatePatch(decision, routed.applyThoughtUpdate)
    ) {
      patch = buildDialogueThoughtPatch({
        action: input.action,
        thoughtUpdate: input.thoughtUpdate,
        userMessageId: userMessage.id,
        userText: userMessage.body,
        facts: lists.facts,
        openGaps: lists.openGaps,
        pendingGapId,
      });
    }
    if (correction && !existingEnvelope) {
      await assertAgentActionAllowed(tx, input.reelId, input.action, take);
    }
    if (patch) {
      await applyThoughtStateInTx(tx, {
        reelId: input.reelId,
        expectedRevision: input.snapshot.thoughtStateRevision,
        patch,
        turnKey: input.turnKey,
      });
    }
    if (correction && !patch && !existingEnvelope) {
      throw new C00EnvelopeError("correction без increment ThoughtState.", "C00_CORRECTION_ATOM");
    }
    if (!correction) {
      await assertAgentActionAllowed(tx, input.reelId, input.action, take);
    }
    if (v03TestSeams.afterThoughtBeforeEnvelope) {
      await v03TestSeams.afterThoughtBeforeEnvelope({ callId: input.callId, turnKey: input.turnKey });
    }
    if (!existingEnvelope && correction) {
      correction = { ...correction, acceptedAt: new Date().toISOString() };
      if (v03TestSeams.afterAcceptedAtBeforeCommit) {
        await v03TestSeams.afterAcceptedAtBeforeCommit({
          reelId: input.reelId,
          acceptedAt: correction.acceptedAt,
        });
      }
    }

    const envelope =
      existingEnvelope ??
      buildC00Envelope({
        aiCallId: call.id,
        turnKey: expectedTurnKey,
        ownerUserId: call.ownerUserId,
        reelId: call.reelId ?? input.reelId,
        action: input.action,
        decision,
        correction,
      });
    assertEnvelopeMatchesCall(envelope, call);

    const written = await tx.aiCall.updateMany({
      where: { id: call.id, turnKey: call.turnKey, status: { not: "done" } },
      data: {
        status: "done",
        responseText: restoringSavedResponse ? call.responseText : input.rawText,
        resultJson: JSON.stringify(envelope),
        promptTokens: input.promptTokens,
        completionTokens: input.completionTokens,
      },
    });
    if (written.count !== 1) {
      const raced = await tx.aiCall.findUniqueOrThrow({ where: { id: call.id } });
      if (!parseC00Envelope(raced.resultJson)) {
        throw new C00EnvelopeError("Не удалось записать конверт хода.", "C00_ENVELOPE_WRITE");
      }
    }
    await finishProcessing(input.action);
  });
}

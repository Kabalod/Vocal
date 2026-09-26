import { prisma } from "@/lib/db";
import { ownerUserId } from "@/lib/auth/session";
import { ReelError } from "@/lib/reels";
import { StateVersionError } from "@/lib/ai/usage-guard";
import { v01TestSeams } from "@/lib/v01-test-seams";
import type { Prisma } from "@prisma/client";
import { actionMessage, assertAgentActionAllowed, type AgentAction, type ThoughtUpdate } from "@/lib/agent-action";
import { applyThoughtStateInTx, buildDialogueThoughtPatch, parseThoughtStateLists } from "@/lib/thought-state";
import {
  assertEnvelopeMatchesCall,
  buildC00Envelope,
  C00EnvelopeError,
  parseC00Envelope,
  thoughtDialogueTurnKey,
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
    if (input.execOwnerId != null && input.execGeneration != null) {
      if (call.execOwnerId !== input.execOwnerId || call.execGeneration !== input.execGeneration) {
        throw new DialogueTurnExecError("Результат хода уже записан другим исполнителем.", "TURN_FENCE");
      }
    }
    const existingEnvelope = parseC00Envelope(call.resultJson);
    if (existingEnvelope) assertEnvelopeMatchesCall(existingEnvelope, call);
    const reuseCompleted =
      call.status === "done" && (existingEnvelope !== null || Boolean(call.resultJson?.trim()));
    if (reuseCompleted) {
      const reusedAction = existingEnvelope?.action ?? input.action;
      const message = actionMessage(reusedAction);
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
            action: reusedAction,
            thoughtUpdate: input.thoughtUpdate,
            userMessageId: input.userMessageId,
            aiCallId: input.callId,
            idempotencyKey: input.turnKey,
          }),
          status: "done",
        },
      });
      return;
    }

    const matches = async () => {
      const current = await readMaterialSnapshot(input.reelId, input.threadId, tx);
      return !materialSnapshotChanged(current, input.snapshot);
    };

    if (!(await matches())) {
      const latest = await tx.dialogueMessage.findUniqueOrThrow({ where: { id: input.processingId } });
      if (isCommittedAssistantTurn(latest)) return;
      throw new StateVersionError();
    }
    if (v01TestSeams.afterMaterialCheck) await v01TestSeams.afterMaterialCheck();
    if (!(await matches())) throw new StateVersionError();
    if (v01TestSeams.afterLastMaterialCheck) await v01TestSeams.afterLastMaterialCheck();

    const take = await tx.take.findFirst({
      where: { id: input.snapshot.workingTakeId, reelId: input.reelId },
      select: { inputType: true, selectedTranscriptId: true },
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
    const lists = parseThoughtStateLists(state);
    const patch = buildDialogueThoughtPatch({
      action: input.action,
      thoughtUpdate: input.thoughtUpdate,
      userMessageId: userMessage.id,
      userText: userMessage.body,
      facts: lists.facts,
      openGaps: lists.openGaps,
      pendingGapId,
    });
    if (patch) {
      await applyThoughtStateInTx(tx, {
        reelId: input.reelId,
        expectedRevision: input.snapshot.thoughtStateRevision,
        patch,
        turnKey: input.turnKey,
      });
    }
    await assertAgentActionAllowed(tx, input.reelId, input.action, take);
    if (v03TestSeams.afterThoughtBeforeEnvelope) {
      await v03TestSeams.afterThoughtBeforeEnvelope({ callId: input.callId, turnKey: input.turnKey });
    }

    const envelope =
      existingEnvelope ??
      buildC00Envelope({
        aiCallId: call.id,
        turnKey: expectedTurnKey,
        ownerUserId: call.ownerUserId,
        reelId: call.reelId ?? input.reelId,
        action: input.action,
      });
    assertEnvelopeMatchesCall(envelope, call);

    const message = actionMessage(input.action);
    const written = await tx.aiCall.updateMany({
      where: { id: call.id, turnKey: call.turnKey, status: { not: "done" } },
      data: {
        status: "done",
        responseText: input.rawText,
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
          action: input.action,
          thoughtUpdate: input.thoughtUpdate,
          userMessageId: input.userMessageId,
          aiCallId: input.callId,
          idempotencyKey: input.turnKey,
        }),
        status: "done",
      },
    });
  });
}

import type { Prisma, PrismaClient } from "@prisma/client";
import {
  V04_EVENT_SCHEMA,
  V04ActionError,
  assertApplyUpdateCompatible,
  assertEvidenceIdsNewForSlot,
  assertProfileDialogueEvidence,
  assertThoughtSpecificAuditMessage,
  isV04DirectCategory,
  type V04ApplyUpdate,
  type V04EvidenceRow,
  type V04ModelReply,
  type V04ThoughtSpecific,
} from "@/lib/v04-action";
import { PROFILE_DIALOGUE_KIND } from "@/lib/ai/profile";
import { overlayProfileSession, serializeStoredPayload } from "@/lib/profile";
import { afterCommitLockedForTests } from "@/lib/profile-lock-seam";
import { buildPortrait, emptyStoredPayload, parseStoredPayload } from "@/lib/profile-portrait";
import {
  applySliceToFields,
  replayV04Slice,
  sliceEqual,
  sliceFromPublishedFields,
} from "@/lib/v04-slice";

type Db = PrismaClient | Prisma.TransactionClient;

export type V04ApplyResult = {
  slotAdmitted: boolean;
  systemWeight: number;
  displaySliceChanged: boolean;
  newRevisionId: string | null;
};

export type V04AcceptedEvent = {
  userMessageId: string;
  kind: "apply_update";
  operation: V04ApplyUpdate["operation"];
  category: V04ApplyUpdate["category"];
  value: string;
  evidenceMessageIds: string[];
  confidence: number;
  evidenceRole: "support" | "oppose";
  applyResult: V04ApplyResult;
};

export type V04ResultEnvelope = {
  schemaVersion: typeof V04_EVENT_SCHEMA;
  kind: V04ModelReply["kind"];
  event: V04AcceptedEvent | null;
  deferred?: boolean;
};

const V04_KINDS = new Set(["apply_update", "no_change", "thought_specific"]);

export function looksLikeV04ModelReply(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const kind = (raw as { kind?: unknown }).kind;
  return typeof kind === "string" && V04_KINDS.has(kind);
}

export function parseV04ResultEnvelope(raw: string | null | undefined): V04ResultEnvelope | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const obj = parsed as Record<string, unknown>;
    if (obj.schemaVersion !== V04_EVENT_SCHEMA) return null;
    if (typeof obj.kind !== "string" || !V04_KINDS.has(obj.kind)) return null;
    if (obj.event === null) {
      return {
        schemaVersion: V04_EVENT_SCHEMA,
        kind: obj.kind as V04ModelReply["kind"],
        event: null,
        deferred: obj.deferred === true,
      };
    }
    if (!obj.event || typeof obj.event !== "object") return null;
    const event = obj.event as V04AcceptedEvent;
    if (event.kind !== "apply_update") return null;
    return { schemaVersion: V04_EVENT_SCHEMA, kind: obj.kind as V04ModelReply["kind"], event };
  } catch {
    return null;
  }
}

export function usedEvidenceIdsForSlot(
  envelopes: V04ResultEnvelope[],
  slot: { category: string; value: string },
): string[] {
  const ids: string[] = [];
  for (const envelope of envelopes) {
    const event = envelope.event;
    if (!event) continue;
    if (event.category !== slot.category || event.value !== slot.value) continue;
    ids.push(...event.evidenceMessageIds);
  }
  return ids;
}

export function v04AssistantBody(input: { action: V04ModelReply; sliceChanged: boolean }): string {
  if (input.action.kind === "no_change") return "В портрет это не записываю.";
  if (input.action.kind === "thought_specific") return "Это относится к конкретной мысли, не к портрету.";
  if (input.sliceChanged) return "Записал в портрет.";
  return "В отображаемый портрет это не меняет.";
}

export async function loadV04EvidenceRows(db: Db, ids: string[]): Promise<V04EvidenceRow[]> {
  if (ids.length === 0) return [];
  const rows = await db.dialogueMessage.findMany({
    where: { id: { in: ids } },
    include: { thread: { include: { profile: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    ownerUserId: row.thread.profile?.ownerUserId ?? "",
    threadScope: row.thread.scope,
    profileId: row.thread.profileId,
  }));
}

async function loadJournalEnvelopes(
  tx: Prisma.TransactionClient,
  profileId: string,
  excludeCallId: string,
): Promise<V04ResultEnvelope[]> {
  const calls = await tx.aiCall.findMany({
    where: {
      kind: PROFILE_DIALOGUE_KIND,
      profileId,
      status: "done",
      id: { not: excludeCallId },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { resultJson: true },
  });
  return calls
    .map((call) => parseV04ResultEnvelope(call.resultJson))
    .filter((item): item is V04ResultEnvelope => item !== null);
}

function evidenceRoleFor(operation: V04ApplyUpdate["operation"]): "support" | "oppose" {
  return operation === "weaken" ? "oppose" : "support";
}

function assertApplySources(
  action: V04ApplyUpdate,
  rows: V04EvidenceRow[],
  journal: V04ResultEnvelope[],
  input: { ownerUserId: string; profileId: string },
) {
  assertProfileDialogueEvidence(action.evidenceMessageIds, rows, input);
  const used = usedEvidenceIdsForSlot(journal, { category: action.category, value: action.value });
  assertEvidenceIdsNewForSlot(action.evidenceMessageIds, used);
  const slotExists = journal.some(
    (envelope) =>
      envelope.event?.category === action.category && envelope.event.value === action.value,
  );
  assertApplyUpdateCompatible(action, { slotExists });
}

async function assertBoundTurn(
  tx: Prisma.TransactionClient,
  input: {
    callId: string;
    processingId: string;
    userMessageId: string;
    profileId: string;
    ownerUserId: string;
  },
) {
  const call = await tx.aiCall.findUnique({ where: { id: input.callId } });
  if (!call) throw new V04ActionError("Вызов модели портрета не найден.", "V04_CALL_MISSING", 500);
  if (
    call.kind !== PROFILE_DIALOGUE_KIND ||
    call.profileId !== input.profileId ||
    call.ownerUserId !== input.ownerUserId
  ) {
    throw new V04ActionError("Вызов не относится к этому ходу профиля.", "V04_TURN_MISMATCH");
  }
  if (call.status !== "done" && call.status !== "running") {
    throw new V04ActionError("Вызов модели в недопустимом статусе.", "V04_TURN_MISMATCH");
  }

  const user = await tx.dialogueMessage.findUnique({
    where: { id: input.userMessageId },
    include: { thread: { include: { profile: true } } },
  });
  const processing = await tx.dialogueMessage.findUnique({
    where: { id: input.processingId },
    include: { thread: true },
  });
  if (!user || user.role !== "user") {
    throw new V04ActionError("Сообщение автора не относится к этому ходу.", "V04_TURN_MISMATCH");
  }
  if (
    user.thread.scope !== "profile" ||
    user.thread.profileId !== input.profileId ||
    user.thread.profile?.ownerUserId !== input.ownerUserId
  ) {
    throw new V04ActionError("Сообщение автора не из диалога этого профиля.", "V04_TURN_MISMATCH");
  }
  if (!processing || processing.role !== "assistant" || processing.threadId !== user.threadId) {
    throw new V04ActionError("Сообщение хода не относится к диалогу профиля.", "V04_TURN_MISMATCH");
  }
  if (call.status !== "done" && (processing.kind !== "processing" || processing.status !== "pending")) {
    throw new V04ActionError("Processing-сообщение не относится к этому ходу.", "V04_TURN_MISMATCH");
  }
  return call;
}

function buildEnvelope(
  action: V04ModelReply,
  userMessageId: string,
  applyResult: V04ApplyResult | null,
): V04ResultEnvelope {
  if (action.kind !== "apply_update" || !applyResult) {
    return { schemaVersion: V04_EVENT_SCHEMA, kind: action.kind, event: null };
  }
  return {
    schemaVersion: V04_EVENT_SCHEMA,
    kind: action.kind,
    event: {
      userMessageId,
      kind: "apply_update",
      operation: action.operation,
      category: action.category,
      value: action.value,
      evidenceMessageIds: action.evidenceMessageIds,
      confidence: action.confidence,
      evidenceRole: evidenceRoleFor(action.operation),
      applyResult,
    },
  };
}

export async function commitV04ProfileTurn(input: {
  prisma: PrismaClient;
  callId: string;
  processingId: string;
  userMessageId: string;
  profileId: string;
  ownerUserId: string;
  action: V04ModelReply;
  rawText: string;
  promptTokens: number | null;
  completionTokens: number | null;
}): Promise<void> {
  await input.prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "CreatorProfile" WHERE id = ${input.profileId} FOR UPDATE`;
    await afterCommitLockedForTests();
    const call = await assertBoundTurn(tx, input);
    if (call.status === "done") return;

    const journal = await loadJournalEnvelopes(tx, input.profileId, input.callId);
    const sourceInput = { ownerUserId: input.ownerUserId, profileId: input.profileId };

    if (input.action.kind === "apply_update") {
      const rows = await loadV04EvidenceRows(tx, input.action.evidenceMessageIds);
      assertApplySources(input.action, rows, journal, sourceInput);
    } else if (input.action.kind === "thought_specific") {
      const thought = input.action as V04ThoughtSpecific;
      if (thought.auditUserMessageId) {
        const rows = await loadV04EvidenceRows(tx, [thought.auditUserMessageId]);
        assertThoughtSpecificAuditMessage(thought, rows, sourceInput);
      }
    }

    const profile = await tx.creatorProfile.findUnique({ where: { id: input.profileId } });
    const revision = profile?.currentRevisionId
      ? await tx.profileRevision.findUnique({ where: { id: profile.currentRevisionId } })
      : null;
    const stored = overlayProfileSession(
      revision ? parseStoredPayload(revision.payloadJson) : emptyStoredPayload(),
      profile?.sessionJson,
    );
    const previousSlice =
      Object.keys(stored.v04Slice).length > 0
        ? stored.v04Slice
        : sliceFromPublishedFields(stored.fields, stored.portrait?.completed === true);

    let applyResult: V04ApplyResult | null = null;
    let sliceChanged = false;
    if (input.action.kind === "apply_update") {
      const journalEvents = journal
        .map((envelope) => envelope.event)
        .filter((event): event is V04AcceptedEvent => event !== null);
      const candidate = {
        operation: input.action.operation,
        category: input.action.category,
        value: input.action.value,
        evidenceMessageIds: input.action.evidenceMessageIds,
        confidence: input.action.confidence,
        evidenceRole: evidenceRoleFor(input.action.operation),
      };
      const replayed = replayV04Slice({ events: [...journalEvents, candidate], previous: previousSlice });
      sliceChanged = !sliceEqual(previousSlice, replayed.slice);
      let newRevisionId: string | null = null;
      if (sliceChanged) {
        const fields = applySliceToFields(stored.fields, replayed.slice);
        const completed = stored.portrait?.completed === true || Object.keys(replayed.slice).length > 0;
        const nextStored = {
          ...stored,
          fields,
          portrait: buildPortrait(fields, completed),
          v04Slice: replayed.slice,
        };
        const created = await tx.profileRevision.create({
          data: {
            profileId: input.profileId,
            payloadJson: serializeStoredPayload(nextStored),
          },
        });
        await tx.creatorProfile.update({
          where: { id: input.profileId },
          data: { currentRevisionId: created.id },
        });
        newRevisionId = created.id;
      }
      const slot = replayed.slotOf(input.action.category, input.action.value);
      applyResult = {
        slotAdmitted: isV04DirectCategory(input.action.category)
          ? replayed.slice[input.action.category] === input.action.value
          : slot.slotAdmitted,
        systemWeight: slot.systemWeight,
        displaySliceChanged: sliceChanged,
        newRevisionId,
      };
    }

    const envelope = buildEnvelope(input.action, input.userMessageId, applyResult);
    await tx.aiCall.update({
      where: { id: input.callId },
      data: {
        status: "done",
        responseText: input.rawText,
        resultJson: JSON.stringify(envelope),
        promptTokens: input.promptTokens,
        completionTokens: input.completionTokens,
      },
    });
    await tx.dialogueMessage.update({
      where: { id: input.processingId },
      data: {
        kind: "text",
        body: v04AssistantBody({ action: input.action, sliceChanged }),
        status: "done",
      },
    });
  });
}

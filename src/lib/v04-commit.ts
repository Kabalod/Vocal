import type { Prisma, PrismaClient } from "@prisma/client";
import { parseStoredPayload } from "@/lib/profile-portrait";
import {
  V04_COUNTING_MIN_CONFIDENCE,
  V04_EVENT_SCHEMA,
  V04ActionError,
  assertApplyUpdateCompatible,
  assertEvidenceIdsNewForSlot,
  assertProfileDialogueEvidence,
  assertThoughtSpecificAuditMessage,
  isV04DirectCategory,
  normalizePortraitValue,
  type V04ApplyUpdate,
  type V04DirectCategory,
  type V04EvidenceRow,
  type V04ModelReply,
  type V04ThoughtSpecific,
} from "@/lib/v04-action";
import { PROFILE_DIALOGUE_KIND } from "@/lib/ai/profile";
import type { ProfileFieldId } from "@/types/profile";

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

const DIRECT_FIELD: Record<V04DirectCategory, ProfileFieldId> = {
  blog_goal: "whyRecord",
  general_audience: "audience",
  standing_topic: "topics",
  explicit_boundary: "boundaries",
};

const NO_SLICE_CHANGE: V04ApplyResult = {
  slotAdmitted: false,
  systemWeight: 0,
  displaySliceChanged: false,
  newRevisionId: null,
};

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
    if (event.applyResult?.displaySliceChanged !== false || event.applyResult.newRevisionId !== null) {
      return null;
    }
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

export function v04AssistantBody(input: { action: V04ModelReply; deferred: boolean }): string {
  if (input.action.kind === "no_change") return "В портрет это не записываю.";
  if (input.action.kind === "thought_specific") return "Это относится к конкретной мысли, не к портрету.";
  if (input.deferred) return "Пока не меняю отображаемый портрет.";
  return "В отображаемый портрет это не меняет.";
}

export function v04ApplyWithoutSliceChange(
  action: V04ApplyUpdate,
  displayedDirectValue: string | null,
): { deferred: true } | { deferred: false; applyResult: V04ApplyResult } {
  if (action.operation === "replace_explicit" && isV04DirectCategory(action.category)) {
    if (displayedDirectValue !== null && displayedDirectValue === action.value) {
      return {
        deferred: false,
        applyResult: {
          slotAdmitted: true,
          systemWeight: 1,
          displaySliceChanged: false,
          newRevisionId: null,
        },
      };
    }
    return { deferred: true };
  }
  if (action.operation === "add_observation" && action.confidence < V04_COUNTING_MIN_CONFIDENCE) {
    return { deferred: false, applyResult: NO_SLICE_CHANGE };
  }
  return { deferred: true };
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

function displayedDirectValue(
  stored: { portrait: { completed: boolean } | null; fields: { id: string; text: string }[] },
  category: V04DirectCategory,
): string | null {
  if (!stored.portrait?.completed) return null;
  const text = stored.fields.find((field) => field.id === DIRECT_FIELD[category])?.text ?? "";
  const value = normalizePortraitValue(text);
  return value || null;
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
  decision: { deferred: true } | { deferred: false; applyResult: V04ApplyResult },
): V04ResultEnvelope {
  if (action.kind !== "apply_update") {
    return { schemaVersion: V04_EVENT_SCHEMA, kind: action.kind, event: null };
  }
  if (decision.deferred) {
    return { schemaVersion: V04_EVENT_SCHEMA, kind: action.kind, event: null, deferred: true };
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
      applyResult: decision.applyResult,
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
    const call = await assertBoundTurn(tx, input);
    if (call.status === "done") return;

    const journal = await loadJournalEnvelopes(tx, input.profileId, input.callId);
    const sourceInput = { ownerUserId: input.ownerUserId, profileId: input.profileId };
    const profile = await tx.creatorProfile.findUnique({ where: { id: input.profileId } });
    const revision = profile?.currentRevisionId
      ? await tx.profileRevision.findUnique({ where: { id: profile.currentRevisionId } })
      : null;
    const stored = revision ? parseStoredPayload(revision.payloadJson) : null;

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

    const decision =
      input.action.kind === "apply_update"
        ? v04ApplyWithoutSliceChange(
            input.action,
            isV04DirectCategory(input.action.category) && stored
              ? displayedDirectValue(stored, input.action.category)
              : null,
          )
        : ({ deferred: false, applyResult: NO_SLICE_CHANGE } as const);
    const envelope = buildEnvelope(
      input.action,
      input.userMessageId,
      input.action.kind === "apply_update" ? decision : { deferred: false, applyResult: NO_SLICE_CHANGE },
    );
    const deferred = envelope.deferred === true;
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
        body: v04AssistantBody({ action: input.action, deferred }),
        status: "done",
      },
    });
  });
}

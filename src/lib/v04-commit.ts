import type { Prisma, PrismaClient } from "@prisma/client";
import {
  V04_EVENT_SCHEMA,
  V04ActionError,
  assertApplyUpdateCompatible,
  assertEvidenceIdsNewForSlot,
  assertProfileDialogueEvidence,
  assertThoughtSpecificAuditMessage,
  type V04ApplyUpdate,
  type V04EvidenceRow,
  type V04ModelReply,
  type V04ThoughtSpecific,
} from "@/lib/v04-action";

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
};

const V04_KINDS = new Set(["apply_update", "no_change", "thought_specific"]);

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
      return { schemaVersion: V04_EVENT_SCHEMA, kind: obj.kind as V04ModelReply["kind"], event: null };
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

export function v04AssistantBody(action: V04ModelReply): string {
  if (action.kind === "no_change") return "В портрет это не записываю.";
  if (action.kind === "thought_specific") return "Это относится к конкретной мысли, не к портрету.";
  return "Принял для портрета.";
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
      kind: "profile_dialogue",
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

function buildEnvelope(
  action: V04ModelReply,
  userMessageId: string,
): V04ResultEnvelope {
  if (action.kind !== "apply_update") {
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
      applyResult: NO_SLICE_CHANGE,
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
    const call = await tx.aiCall.findUnique({ where: { id: input.callId } });
    if (!call) throw new V04ActionError("Вызов модели портрета не найден.", "V04_CALL_MISSING", 500);
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

    const envelope = buildEnvelope(input.action, input.userMessageId);
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
      data: { kind: "text", body: v04AssistantBody(input.action), status: "done" },
    });
  });
}

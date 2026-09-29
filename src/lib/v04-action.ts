import { z } from "zod";

export const V04_EVENT_SCHEMA = "v04-event-1";

export class V04ActionError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "V04ActionError";
  }
}

export const V04_DIRECT_CATEGORIES = [
  "blog_goal",
  "general_audience",
  "standing_topic",
  "explicit_boundary",
] as const;

export const V04_DERIVED_CATEGORIES = [
  "explanation_style",
  "concreteness",
  "lead_style",
  "preferred_question_form",
] as const;

export const V04_DERIVED_VALUES = {
  explanation_style: ["stepwise", "analogy", "contrast"],
  concreteness: ["high", "low"],
  lead_style: ["example_first", "conclusion_first"],
  preferred_question_form: ["open", "closed", "short_choice"],
} as const;

export const V04_OPERATIONS = ["replace_explicit", "add_observation", "strengthen", "weaken"] as const;
export const V04_COUNTING_MIN_CONFIDENCE = 0.5;
export const V04_EVIDENCE_TYPES = ["explicit_statement", "behavioral_observation"] as const;
export const V04_NO_CHANGE_REASONS = [
  "insufficient_signal",
  "already_known",
  "refusal",
  "praise_or_support",
  "diagnosis_or_label",
  "mood",
  "invented_event",
  "off_topic",
] as const;
export const V04_THOUGHT_SPECIFIC_REASONS = ["thought_detail", "thought_dialogue", "reel_episode"] as const;

export type V04DirectCategory = (typeof V04_DIRECT_CATEGORIES)[number];
export type V04DerivedCategory = (typeof V04_DERIVED_CATEGORIES)[number];
export type V04Category = V04DirectCategory | V04DerivedCategory;
export type V04Operation = (typeof V04_OPERATIONS)[number];
export type V04EvidenceType = (typeof V04_EVIDENCE_TYPES)[number];

const DIRECT = new Set<string>(V04_DIRECT_CATEGORIES);
const DERIVED = new Set<string>(V04_DERIVED_CATEGORIES);

export function isV04DirectCategory(value: string): value is V04DirectCategory {
  return DIRECT.has(value);
}

export function isV04DerivedCategory(value: string): value is V04DerivedCategory {
  return DERIVED.has(value);
}

export function normalizePortraitValue(value: string) {
  return value.trim().normalize("NFC");
}

const applyUpdateSchema = z
  .object({
    kind: z.literal("apply_update"),
    category: z.enum([...V04_DIRECT_CATEGORIES, ...V04_DERIVED_CATEGORIES]),
    value: z.string(),
    scope: z.literal("global"),
    evidenceType: z.enum(V04_EVIDENCE_TYPES),
    evidenceMessageIds: z.array(z.string().trim().min(1)).min(1),
    confidence: z.number().finite().min(0).max(1),
    operation: z.enum(V04_OPERATIONS),
  })
  .strict();

const noChangeSchema = z
  .object({
    kind: z.literal("no_change"),
    reasonCode: z.enum(V04_NO_CHANGE_REASONS),
  })
  .strict();

const thoughtSpecificSchema = z
  .object({
    kind: z.literal("thought_specific"),
    reasonCode: z.enum(V04_THOUGHT_SPECIFIC_REASONS),
    auditUserMessageId: z.string().trim().min(1).optional(),
  })
  .strict();

export const v04ModelReplySchema = z.discriminatedUnion("kind", [
  applyUpdateSchema,
  noChangeSchema,
  thoughtSpecificSchema,
]);

export type V04ModelReply = z.infer<typeof v04ModelReplySchema>;
export type V04ApplyUpdate = Extract<V04ModelReply, { kind: "apply_update" }>;
export type V04ThoughtSpecific = Extract<V04ModelReply, { kind: "thought_specific" }>;

export type V04EvidenceRow = {
  id: string;
  role: string;
  ownerUserId: string;
  threadScope: string;
  profileId: string | null;
};

function derivedValueOk(category: V04DerivedCategory, value: string) {
  return (V04_DERIVED_VALUES[category] as readonly string[]).includes(value);
}

export function parseV04ModelReply(raw: unknown): V04ModelReply {
  const parsed = v04ModelReplySchema.safeParse(raw);
  if (!parsed.success) {
    throw new V04ActionError("Ответ модели не соответствует контракту портрета.", "V04_SHAPE");
  }
  const action = parsed.data;
  if (action.kind !== "apply_update") return action;
  const value = normalizePortraitValue(action.value);
  if (!value || value.length > 4000) {
    throw new V04ActionError("Значение поля портрета недопустимо.", "V04_VALUE");
  }
  if (isV04DerivedCategory(action.category) && !derivedValueOk(action.category, value)) {
    throw new V04ActionError("Значение производной категории не из enum.", "V04_VALUE");
  }
  const ids = action.evidenceMessageIds.map((id) => id.trim());
  if (new Set(ids).size !== ids.length) {
    throw new V04ActionError("Одно основание нельзя указать дважды в одном ходе.", "V04_EVIDENCE_DUP");
  }
  return { ...action, value, evidenceMessageIds: ids };
}

export function applyUpdateCompatibilityError(
  action: V04ApplyUpdate,
  input: { slotExists: boolean },
): string | null {
  const direct = isV04DirectCategory(action.category);
  if (action.operation === "replace_explicit") {
    if (!direct || action.evidenceType !== "explicit_statement") return "V04_TRANSITION";
    return null;
  }
  if (direct || action.evidenceType !== "behavioral_observation") return "V04_TRANSITION";
  if (action.operation === "add_observation") return null;
  if ((action.operation === "strengthen" || action.operation === "weaken") && !input.slotExists) {
    return "V04_SLOT_MISSING";
  }
  return null;
}

export function assertApplyUpdateCompatible(action: V04ApplyUpdate, input: { slotExists: boolean }) {
  const code = applyUpdateCompatibilityError(action, input);
  if (code === "V04_TRANSITION") {
    throw new V04ActionError("Операция несовместима с категорией или типом основания.", code);
  }
  if (code === "V04_SLOT_MISSING") {
    throw new V04ActionError("Слот наблюдения ещё не существует.", code);
  }
}

export function evidenceAlreadyUsedError(ids: string[], usedInSlot: Iterable<string>): string | null {
  const used = new Set(usedInSlot);
  if (ids.some((id) => used.has(id))) return "V04_EVIDENCE_USED";
  return null;
}

export function assertEvidenceIdsNewForSlot(ids: string[], usedInSlot: Iterable<string>) {
  if (evidenceAlreadyUsedError(ids, usedInSlot)) {
    throw new V04ActionError("Это сообщение уже учтено в слоте портрета.", "V04_EVIDENCE_USED");
  }
}

export function evidenceSourceError(
  ids: string[],
  rows: V04EvidenceRow[],
  input: { ownerUserId: string; profileId: string },
): string | null {
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) return "V04_EVIDENCE_MISSING";
    if (row.role !== "user") return "V04_EVIDENCE_ROLE";
    if (row.ownerUserId !== input.ownerUserId) return "V04_EVIDENCE_OWNER";
    if (row.threadScope !== "profile" || row.profileId !== input.profileId) return "V04_EVIDENCE_THREAD";
  }
  return null;
}

export function assertProfileDialogueEvidence(
  ids: string[],
  rows: V04EvidenceRow[],
  input: { ownerUserId: string; profileId: string },
) {
  const code = evidenceSourceError(ids, rows, input);
  if (!code) return;
  const messages: Record<string, string> = {
    V04_EVIDENCE_MISSING: "Основание портрета не найдено.",
    V04_EVIDENCE_ROLE: "Основанием может быть только сообщение автора.",
    V04_EVIDENCE_OWNER: "Чужое основание портрета недопустимо.",
    V04_EVIDENCE_THREAD: "Основание должно быть из диалога профиля, не из мысли.",
  };
  throw new V04ActionError(messages[code] ?? "Основание портрета недопустимо.", code);
}

export function assertThoughtSpecificAuditMessage(
  action: V04ThoughtSpecific,
  rows: V04EvidenceRow[],
  input: { ownerUserId: string; profileId: string },
) {
  if (!action.auditUserMessageId) return;
  assertProfileDialogueEvidence([action.auditUserMessageId], rows, input);
}

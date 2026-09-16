import {
  PORTRAIT_SECTION_FIELDS,
  PORTRAIT_SECTION_IDS,
  PORTRAIT_SECTION_TITLES,
  PROFILE_FIELD_IDS,
  PROFILE_FIELD_LABELS,
  PROFILE_FIELD_MAX,
  PROFILE_FIELD_OPS,
  emptyProfileFields,
  isProfileFieldId,
  isProfileUsage,
  type PortraitDto,
  type ProfileDialogueMode,
  type ProfileFieldId,
  type ProfileFieldOpKind,
  type ProfileFieldOperation,
  type ProfileFieldPatch,
  type ProfileFieldValue,
  type ProfilePendingChange,
  type ProfilePortraitPatch,
  type ProfileUsage,
} from "@/types/profile";

export type StoredProfilePayload = {
  fields: ProfileFieldValue[];
  skipped: boolean;
  supplementing: boolean;
  portrait: PortraitDto | null;
  pending: ProfilePendingChange | null;
  dialogueSessionStartId: string | null;
};

export function coveredProfileKeys(fields: ProfileFieldValue[]): ProfileFieldId[] {
  return PROFILE_FIELD_IDS.filter((id) => (fields.find((field) => field.id === id)?.text.trim() ?? "") !== "");
}

export function hasUsefulPortraitMinimum(fields: ProfileFieldValue[]): boolean {
  const byId = new Map(fields.map((field) => [field.id, field.text.trim()]));
  const hasGoal = Boolean(byId.get("whyRecord") || byId.get("blogGoal"));
  const hasAudienceOrTopics = Boolean(byId.get("audience") || byId.get("topics"));
  return hasGoal && hasAudienceOrTopics;
}

export function buildPortrait(fields: ProfileFieldValue[], completed: boolean): PortraitDto {
  const coveredKeys = coveredProfileKeys(fields);
  const byId = new Map(fields.map((field) => [field.id, field]));
  const sections = PORTRAIT_SECTION_IDS.flatMap((id) => {
    const text = PORTRAIT_SECTION_FIELDS[id]
      .map((fieldId) => byId.get(fieldId)?.text.trim() ?? "")
      .filter(Boolean)
      .join("\n\n");
    if (!text) return [];
    return [{ id, title: PORTRAIT_SECTION_TITLES[id], text }];
  });
  return {
    completed,
    coveredKeys,
    missingKeys: PROFILE_FIELD_IDS.filter((id) => !coveredKeys.includes(id)),
    sections,
  };
}

export function mergeProfileFields(
  current: ProfileFieldValue[],
  patch: ProfilePortraitPatch,
): ProfileFieldValue[] {
  const base = current.length ? current : emptyProfileFields();
  return PROFILE_FIELD_IDS.map((id) => {
    const field = base.find((item) => item.id === id) ?? {
      id,
      label: PROFILE_FIELD_LABELS[id],
      text: "",
      usage: "understanding" as ProfileUsage,
    };
    const next = patch[id];
    if (!next) return field;
    const usage =
      typeof next.usage === "string" && isProfileUsage(next.usage) ? next.usage : field.usage;
    if (next.clear === true) {
      return { ...field, text: "", usage };
    }
    const rawText = typeof next.text === "string" ? next.text.trim().slice(0, PROFILE_FIELD_MAX) : "";
    if (!rawText) {
      return next.usage !== undefined ? { ...field, usage } : field;
    }
    return { ...field, text: rawText, usage };
  });
}

function patchFieldText(raw: unknown): string | undefined {
  if (typeof raw === "string") return raw;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const row = raw as { text?: unknown; value?: unknown };
  if (typeof row.text === "string") return row.text;
  if (typeof row.value === "string") return row.value;
  return undefined;
}

function patchFieldUsage(raw: unknown): ProfileUsage | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const usage = (raw as { usage?: unknown }).usage;
  return typeof usage === "string" && isProfileUsage(usage) ? usage : undefined;
}

export function sanitizePortraitPatch(input: unknown): ProfilePortraitPatch {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const patch: ProfilePortraitPatch = {};
  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!isProfileFieldId(key) || raw == null) continue;
    const item: ProfileFieldPatch = {};
    if (raw === true || (typeof raw === "object" && !Array.isArray(raw) && (raw as { clear?: unknown }).clear === true)) {
      item.clear = true;
    }
    const text = patchFieldText(raw);
    if (typeof text === "string") item.text = text;
    const usage = patchFieldUsage(raw);
    if (usage) item.usage = usage;
    if (typeof raw === "object" && !Array.isArray(raw) && (raw as { op?: unknown }).op === "clear") {
      item.clear = true;
    }
    if (item.text !== undefined || item.usage !== undefined || item.clear) patch[key] = item;
  }
  return patch;
}

export function sanitizeFieldOperations(input: unknown): ProfileFieldOperation[] {
  if (!Array.isArray(input)) return [];
  const ops: ProfileFieldOperation[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const row = item as { field?: unknown; op?: unknown; action?: unknown; text?: unknown; value?: unknown; usage?: unknown };
    if (typeof row.field !== "string" || !isProfileFieldId(row.field)) continue;
    const rawOp = typeof row.op === "string" ? row.op : typeof row.action === "string" ? row.action : null;
    if (rawOp && !(PROFILE_FIELD_OPS as readonly string[]).includes(rawOp)) continue;
    const op = (rawOp && (PROFILE_FIELD_OPS as readonly string[]).includes(rawOp)
      ? rawOp
      : "set") as ProfileFieldOpKind;
    const usage = typeof row.usage === "string" && isProfileUsage(row.usage) ? row.usage : undefined;
    const text =
      typeof row.text === "string" ? row.text : typeof row.value === "string" ? row.value : undefined;
    ops.push({ field: row.field, op, text, usage });
  }
  return ops;
}

export function applyFieldOperations(
  current: ProfileFieldValue[],
  operations: ProfileFieldOperation[],
  legacyPatch: ProfilePortraitPatch = {},
): ProfileFieldValue[] {
  let next = mergeProfileFields(current, legacyPatch);
  for (const operation of operations) {
    if (operation.op === "clear") {
      next = mergeProfileFields(next, { [operation.field]: { clear: true, usage: operation.usage } });
      continue;
    }
    if (operation.op === "usage" && operation.usage) {
      next = mergeProfileFields(next, { [operation.field]: { usage: operation.usage } });
      continue;
    }
    if (operation.op === "set" && typeof operation.text === "string") {
      next = mergeProfileFields(next, {
        [operation.field]: { text: operation.text, usage: operation.usage },
      });
    }
  }
  return next;
}

export function applyUnchangedFieldsOnly(
  current: ProfileFieldValue[],
  snapshot: ProfileFieldValue[] | null | undefined,
  operations: ProfileFieldOperation[],
  legacyPatch: ProfilePortraitPatch = {},
): ProfileFieldValue[] {
  const tentative = applyFieldOperations(current, operations, legacyPatch);
  if (!snapshot?.length) return tentative;
  const nowById = new Map(current.map((field) => [field.id, field]));
  const nextById = new Map(tentative.map((field) => [field.id, field]));
  const snapById = new Map(snapshot.map((field) => [field.id, field]));
  return PROFILE_FIELD_IDS.map((id) => {
    const now = nowById.get(id) ?? emptyProfileFields().find((field) => field.id === id)!;
    const next = nextById.get(id) ?? now;
    const snap = snapById.get(id);
    if (now.text === next.text && now.usage === next.usage) return now;
    if (snap && snap.text === now.text && snap.usage === now.usage) return next;
    return now;
  });
}

export function decidePortraitComplete(input: {
  fields: ProfileFieldValue[];
  modelComplete: boolean;
  mode: ProfileDialogueMode;
  hasChange: boolean;
  noChange?: boolean;
  kind?: "clarify" | "ready";
  openQuestions?: string[];
}): boolean {
  if (input.kind === "clarify") return false;
  if ((input.openQuestions ?? []).some((item) => item.trim().length > 0)) return false;
  if (!input.modelComplete) return false;
  if (input.mode === "amend") return input.hasChange || input.noChange === true;
  return hasUsefulPortraitMinimum(input.fields);
}

export function parsePending(raw: unknown): ProfilePendingChange | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as {
    mode?: unknown;
    understood?: unknown;
    openQuestions?: unknown;
    draftFields?: unknown;
    readyToConfirm?: unknown;
  };
  const mode: ProfileDialogueMode = row.mode === "amend" ? "amend" : "intake";
  const understood = typeof row.understood === "string" ? row.understood : "";
  const openQuestions = Array.isArray(row.openQuestions)
    ? row.openQuestions.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const draftFields =
    Array.isArray(row.draftFields) || (row.draftFields && typeof row.draftFields === "object")
      ? mergeProfileFields(emptyProfileFields(), sanitizePortraitPatch(asFieldPatch(row.draftFields)))
      : emptyProfileFields();
  return { mode, understood, openQuestions, draftFields, readyToConfirm: row.readyToConfirm === true };
}

export function parseStoredPayload(raw: string): StoredProfilePayload {
  try {
    const parsed = JSON.parse(raw) as {
      fields?: unknown;
      skipped?: unknown;
      supplementing?: unknown;
      portrait?: unknown;
      pending?: unknown;
      dialogueSessionStartId?: unknown;
    };
    const fields =
      Array.isArray(parsed.fields) || (parsed.fields && typeof parsed.fields === "object")
        ? mergeProfileFields(emptyProfileFields(), sanitizePortraitPatch(asFieldPatch(parsed.fields)))
        : emptyProfileFields();
    return {
      fields,
      skipped: parsed.skipped === true,
      supplementing: parsed.supplementing === true,
      portrait: parsed.portrait && typeof parsed.portrait === "object" ? (parsed.portrait as PortraitDto) : null,
      pending: parsePending(parsed.pending),
      dialogueSessionStartId:
        typeof parsed.dialogueSessionStartId === "string" && parsed.dialogueSessionStartId.trim()
          ? parsed.dialogueSessionStartId
          : null,
    };
  } catch {
    return {
      fields: emptyProfileFields(),
      skipped: false,
      supplementing: false,
      portrait: null,
      pending: null,
      dialogueSessionStartId: null,
    };
  }
}

function asFieldPatch(input: unknown): ProfilePortraitPatch {
  if (Array.isArray(input)) {
    const patch: ProfilePortraitPatch = {};
    for (const item of input) {
      if (!item || typeof item !== "object") continue;
      const row = item as { id?: unknown; text?: unknown; value?: unknown; usage?: unknown };
      if (typeof row.id !== "string" || !isProfileFieldId(row.id)) continue;
      const text = patchFieldText(row);
      patch[row.id] = {
        text: typeof text === "string" ? text : "",
        usage: patchFieldUsage(row),
      };
    }
    return patch;
  }
  return sanitizePortraitPatch(input);
}

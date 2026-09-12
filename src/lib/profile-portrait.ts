import {
  PORTRAIT_SECTION_FIELDS,
  PORTRAIT_SECTION_IDS,
  PORTRAIT_SECTION_TITLES,
  PROFILE_FIELD_IDS,
  PROFILE_FIELD_LABELS,
  PROFILE_FIELD_MAX,
  emptyProfileFields,
  isProfileFieldId,
  isProfileUsage,
  type PortraitDto,
  type ProfileFieldId,
  type ProfileFieldPatch,
  type ProfileFieldValue,
  type ProfilePortraitPatch,
  type ProfileUsage,
} from "@/types/profile";
export type StoredProfilePayload = {
  fields: ProfileFieldValue[];
  skipped: boolean;
  supplementing: boolean;
  portrait: PortraitDto | null;
};

export function coveredProfileKeys(fields: ProfileFieldValue[]): ProfileFieldId[] {
  return PROFILE_FIELD_IDS.filter((id) => (fields.find((field) => field.id === id)?.text.trim() ?? "") !== "");
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
    const rawText = typeof next.text === "string" ? next.text.trim().slice(0, PROFILE_FIELD_MAX) : "";
    const usage =
      typeof next.usage === "string" && isProfileUsage(next.usage) ? next.usage : field.usage;
    if (!rawText) {
      return next.usage !== undefined ? { ...field, usage } : field;
    }
    return { ...field, text: rawText, usage };
  });
}

export function sanitizePortraitPatch(input: unknown): ProfilePortraitPatch {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const patch: ProfilePortraitPatch = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!isProfileFieldId(key) || !value || typeof value !== "object") continue;
    const row = value as { text?: unknown; usage?: unknown };
    const item: ProfileFieldPatch = {};
    if (typeof row.text === "string") item.text = row.text;
    if (typeof row.usage === "string" && isProfileUsage(row.usage)) item.usage = row.usage;
    if (item.text !== undefined || item.usage !== undefined) patch[key] = item;
  }
  return patch;
}

export function decidePortraitComplete(input: {
  fields: ProfileFieldValue[];
  modelComplete: boolean;
  supplementing: boolean;
  patchHadText: boolean;
}): boolean {
  const covered = coveredProfileKeys(input.fields).length;
  if (input.supplementing) {
    return input.modelComplete || (input.patchHadText && covered >= 1);
  }
  if (covered >= 5) return true;
  return input.modelComplete && covered >= 2;
}

export function parseStoredPayload(raw: string): StoredProfilePayload {
  try {
    const parsed = JSON.parse(raw) as {
      fields?: unknown;
      skipped?: unknown;
      supplementing?: unknown;
      portrait?: unknown;
    };
    const fields = Array.isArray(parsed.fields) || (parsed.fields && typeof parsed.fields === "object")
      ? mergeProfileFields(emptyProfileFields(), sanitizePortraitPatch(asFieldPatch(parsed.fields)))
      : emptyProfileFields();
    return {
      fields,
      skipped: parsed.skipped === true,
      supplementing: parsed.supplementing === true,
      portrait: parsed.portrait && typeof parsed.portrait === "object" ? (parsed.portrait as PortraitDto) : null,
    };
  } catch {
    return {
      fields: emptyProfileFields(),
      skipped: false,
      supplementing: false,
      portrait: null,
    };
  }
}

function asFieldPatch(input: unknown): ProfilePortraitPatch {
  if (Array.isArray(input)) {
    const patch: ProfilePortraitPatch = {};
    for (const item of input) {
      if (!item || typeof item !== "object") continue;
      const row = item as { id?: unknown; text?: unknown; usage?: unknown };
      if (typeof row.id !== "string" || !isProfileFieldId(row.id)) continue;
      patch[row.id] = {
        text: typeof row.text === "string" ? row.text : "",
        usage: typeof row.usage === "string" && isProfileUsage(row.usage) ? row.usage : undefined,
      };
    }
    return patch;
  }
  return sanitizePortraitPatch(input);
}

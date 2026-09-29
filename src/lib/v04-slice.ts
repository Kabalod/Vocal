import {
  V04_COUNTING_MIN_CONFIDENCE,
  V04_DERIVED_CATEGORIES,
  V04_DIRECT_CATEGORIES,
  V04_PUBLISH_THRESHOLD,
  V04_REMOVE_THRESHOLD,
  isV04DerivedCategory,
  isV04DirectCategory,
  normalizePortraitValue,
  type V04ApplyUpdate,
  type V04Category,
  type V04DirectCategory,
} from "@/lib/v04-action";
import type { ProfileFieldId, ProfileFieldValue } from "@/types/profile";

export type V04JournalEvent = {
  operation: V04ApplyUpdate["operation"];
  category: V04ApplyUpdate["category"];
  value: string;
  evidenceMessageIds: string[];
  confidence: number;
  evidenceRole: "support" | "oppose";
};

export type V04Slice = Partial<Record<V04Category, string>>;

export const V04_DIRECT_FIELD: Record<V04DirectCategory, ProfileFieldId> = {
  blog_goal: "whyRecord",
  general_audience: "audience",
  standing_topic: "topics",
  explicit_boundary: "boundaries",
};

function slotKey(category: string, value: string) {
  return `${category}\0${value}`;
}

export function parseV04Slice(raw: unknown): V04Slice {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const slice: V04Slice = {};
  for (const [category, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isV04DirectCategory(category) && !isV04DerivedCategory(category)) continue;
    if (typeof value !== "string") continue;
    const normalized = normalizePortraitValue(value);
    if (!normalized) continue;
    slice[category] = normalized;
  }
  return slice;
}

export function sliceEqual(left: V04Slice, right: V04Slice) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (left[key as V04Category] !== right[key as V04Category]) return false;
  }
  return true;
}

export function sliceFromPublishedFields(fields: ProfileFieldValue[], completed: boolean): V04Slice {
  if (!completed) return {};
  const slice: V04Slice = {};
  for (const category of V04_DIRECT_CATEGORIES) {
    const text = fields.find((field) => field.id === V04_DIRECT_FIELD[category])?.text ?? "";
    const value = normalizePortraitValue(text);
    if (value) slice[category] = value;
  }
  return slice;
}

type Slot = {
  category: string;
  value: string;
  support: Set<string>;
  oppose: Set<string>;
  admitted: boolean;
};

function weight(slot: Slot) {
  return slot.support.size - slot.oppose.size;
}

function pickDerivedValue(category: string, slots: Slot[], current: string | undefined): string | undefined {
  const admitted = slots.filter((slot) => slot.category === category && slot.admitted);
  if (!admitted.length) return undefined;
  const max = Math.max(...admitted.map(weight));
  const top = admitted.filter((slot) => weight(slot) === max);
  if (current && top.some((slot) => slot.value === current)) return current;
  return [...top.map((slot) => slot.value)].sort()[0];
}

export function replayV04Slice(input: {
  events: V04JournalEvent[];
  previous: V04Slice;
}): {
  slice: V04Slice;
  slotOf(category: string, value: string): { systemWeight: number; slotAdmitted: boolean };
} {
  const slots = new Map<string, Slot>();
  const direct = { ...input.previous };
  for (const category of V04_DERIVED_CATEGORIES) delete direct[category];

  for (const event of input.events) {
    if (event.operation === "replace_explicit" && isV04DirectCategory(event.category)) {
      direct[event.category] = event.value;
    }
    const key = slotKey(event.category, event.value);
    const slot = slots.get(key) ?? {
      category: event.category,
      value: event.value,
      support: new Set<string>(),
      oppose: new Set<string>(),
      admitted: false,
    };
    if (event.confidence >= V04_COUNTING_MIN_CONFIDENCE) {
      const bucket = event.evidenceRole === "oppose" ? slot.oppose : slot.support;
      for (const id of event.evidenceMessageIds) bucket.add(id);
      const nextWeight = weight(slot);
      if (nextWeight >= V04_PUBLISH_THRESHOLD) slot.admitted = true;
      else if (nextWeight <= V04_REMOVE_THRESHOLD) slot.admitted = false;
    }
    slots.set(key, slot);
  }

  const derived: V04Slice = {};
  const slotList = [...slots.values()];
  for (const category of V04_DERIVED_CATEGORIES) {
    const picked = pickDerivedValue(category, slotList, input.previous[category]);
    if (picked) derived[category] = picked;
  }

  const slice = { ...direct, ...derived };
  return {
    slice,
    slotOf(category, value) {
      const slot = slots.get(slotKey(category, value));
      if (!slot) return { systemWeight: 0, slotAdmitted: false };
      return { systemWeight: weight(slot), slotAdmitted: slot.admitted };
    },
  };
}

export function applyDirectSliceToFields(fields: ProfileFieldValue[], slice: V04Slice): ProfileFieldValue[] {
  return fields.map((field) => {
    for (const category of V04_DIRECT_CATEGORIES) {
      if (field.id !== V04_DIRECT_FIELD[category]) continue;
      const value = slice[category] ?? "";
      return { ...field, text: value };
    }
    return field;
  });
}

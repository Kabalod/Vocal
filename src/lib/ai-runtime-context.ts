import { emptyProfileFields, PROFILE_FIELD_IDS, type ProfileFieldId, type ProfileFieldValue } from "@/types/profile";
import type { StoredProfilePayload } from "@/lib/profile-portrait";

export function runtimePortraitFields(stored: StoredProfilePayload): ProfileFieldValue[] {
  if (!stored.portrait?.completed) return emptyProfileFields();
  return stored.fields;
}

export function runtimePortraitRevisionId(
  stored: StoredProfilePayload,
  currentRevisionId: string | null,
): string | null {
  if (!stored.portrait?.completed) return null;
  return currentRevisionId;
}

export function selectedKeysForRuntime(
  fields: ProfileFieldValue[],
  selectedKeys: ProfileFieldId[],
): ProfileFieldId[] {
  if (selectedKeys.length > 0) return selectedKeys;
  const filled = new Set(
    fields.filter((field) => field.text.trim()).map((field) => field.id as ProfileFieldId),
  );
  return PROFILE_FIELD_IDS.filter((id) => filled.has(id));
}

export function promptContainsAny(prompt: string, needles: string[]): string[] {
  return needles.filter((needle) => needle.length > 0 && prompt.includes(needle));
}

export function draftAmendEntersRuntime(stored: StoredProfilePayload): boolean {
  const runtime = runtimePortraitFields(stored)
    .map((field) => field.text)
    .join("\n");
  const draft = (stored.pending?.draftFields ?? [])
    .map((field) => field.text.trim())
    .filter(Boolean);
  if (!stored.portrait?.completed || draft.length === 0) return false;
  return draft.some((text) => text && !stored.fields.some((field) => field.text === text) && runtime.includes(text));
}

export function safeAiLog(input: {
  kind: string;
  code?: string;
  reelId?: string | null;
  callId?: string | null;
}): string {
  const parts = ["ai", input.kind];
  if (input.callId) parts.push(`call=${input.callId}`);
  if (input.reelId) parts.push(`reel=${input.reelId}`);
  if (input.code) parts.push(input.code);
  return parts.join(" ");
}

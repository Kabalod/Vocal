import { z } from "zod";
import { PROFILE_FIELD_IDS, PROFILE_FIELD_LABELS, type ProfileDialogueMode, type ProfileFieldId } from "@/types/profile";
import { sanitizeFieldOperations, sanitizePortraitPatch } from "@/lib/profile-portrait";
import {
  V04_DERIVED_CATEGORIES,
  V04_DIRECT_CATEGORIES,
  V04_NO_CHANGE_REASONS,
  V04_THOUGHT_SPECIFIC_REASONS,
} from "@/lib/v04-action";
import type { V04Slice } from "@/lib/v04-slice";

export const PROFILE_DIALOGUE_KIND = "profile_dialogue";

export const PROFILE_DIALOGUE_SYSTEM = `Ты Vocal. Классифицируешь одну реплику автора для глобального портрета.
Верни только JSON одного discriminated union. Лишние поля запрещены.
kind: apply_update | no_change | thought_specific.
apply_update: category, value, scope=global, evidenceType, evidenceMessageIds, confidence 0..1, operation.
Прямые категории: ${V04_DIRECT_CATEGORIES.join(", ")}. Для них operation=replace_explicit и evidenceType=explicit_statement.
Производные: ${V04_DERIVED_CATEGORIES.join(", ")}. Для них behavioral_observation и add_observation|strengthen|weaken.
evidenceMessageIds — id сообщений автора из этого диалога профиля; обычно текущее. Не бери диалог мысли.
Прямое сведение появляется сразу, без confirm. Производное копит вес; одно наблюдение характеристику не делает.
Похвала, диагноз, настроение, отказ, мало сигнала → no_change с reasonCode: ${V04_NO_CHANGE_REASONS.join(", ")}.
Деталь конкретной мысли, диалог мысли, эпизод ролика → thought_specific с reasonCode: ${V04_THOUGHT_SPECIFIC_REASONS.join(", ")}.
Не выдумывай биографию. Не проси подтвердить портрет. Не возвращай patch, operations, complete, kind=ready.
Сервер сам пишет видимый ответ автору.`;

export const profileReplySchema = z.object({
  reply: z.string().optional(),
  kind: z.string().optional(),
  mode: z.string().optional(),
  coveredKeys: z.array(z.string()).optional(),
  missingKeys: z.array(z.string()).optional(),
  openQuestions: z.array(z.string()).optional(),
  understood: z.string().optional(),
  operations: z.unknown().optional(),
  patch: z.unknown().optional(),
  complete: z.boolean().optional(),
  noChange: z.boolean().optional(),
});

export type ProfileAiReply = {
  reply: string;
  kind: "clarify" | "ready";
  mode: ProfileDialogueMode;
  coveredKeys: ProfileFieldId[];
  missingKeys: ProfileFieldId[];
  openQuestions: string[];
  understood: string;
  operations: ReturnType<typeof sanitizeFieldOperations>;
  patch: ReturnType<typeof sanitizePortraitPatch>;
  complete: boolean;
  noChange: boolean;
};

function asFieldIds(input: unknown): ProfileFieldId[] {
  if (!Array.isArray(input)) return [];
  const allowed = new Set<string>(PROFILE_FIELD_IDS);
  const seen = new Set<string>();
  const keys: ProfileFieldId[] = [];
  for (const item of input) {
    if (typeof item !== "string" || !allowed.has(item) || seen.has(item)) continue;
    seen.add(item);
    keys.push(item as ProfileFieldId);
  }
  return keys;
}

export function fallbackProfileReply(missingKeys: ProfileFieldId[], mode: ProfileDialogueMode = "intake"): string {
  const next = missingKeys[0];
  if (next) return `Продолжим. ${PROFILE_FIELD_LABELS[next]}?`;
  if (mode === "amend") return "Что именно изменить в портрете — цель, аудиторию, темы, подачу или границы?";
  return "Что ещё важно для портрета — цель, аудитория, темы, подача или границы?";
}

export function parseProfileAiReply(raw: unknown, mode: ProfileDialogueMode = "intake"): ProfileAiReply {
  const parsed = profileReplySchema.safeParse(raw);
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const source = parsed.success ? parsed.data : obj;
  const patch = sanitizePortraitPatch(source.patch ?? obj.patch);
  const operations = sanitizeFieldOperations(source.operations ?? obj.operations);
  const missingKeys = asFieldIds(source.missingKeys ?? obj.missingKeys);
  const coveredKeys = asFieldIds(source.coveredKeys ?? obj.coveredKeys);
  const openQuestions = Array.isArray(source.openQuestions)
    ? source.openQuestions.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const replyRaw = typeof source.reply === "string" ? source.reply.trim() : "";
    const kind =
      source.kind === "clarify"
        ? "clarify"
        : source.kind === "ready"
          ? "ready"
          : source.complete === true
            ? "ready"
            : "clarify";
    const complete = source.complete === true && kind !== "clarify";
  return {
    reply: replyRaw || fallbackProfileReply(missingKeys, mode),
    kind,
    mode: source.mode === "amend" ? "amend" : mode,
    coveredKeys,
    missingKeys,
    openQuestions,
    understood: typeof source.understood === "string" ? source.understood.trim() : "",
    operations,
    patch,
    complete,
    noChange: source.noChange === true,
  };
}

export function profileV04UserPrompt(input: {
  slice: V04Slice;
  published: boolean;
  recentText: string;
  authorText: string;
  userMessageId: string;
}): string {
  return `Отображаемый срез портрета (уже действует, confirm нет): ${JSON.stringify(input.slice)}
Портрет опубликован: ${input.published ? "да" : "нет"}
Текущее сообщение автора (id для evidenceMessageIds): ${input.userMessageId}
Недавняя переписка:
${input.recentText}
Ответ автора: ${input.authorText}
Один JSON, например {"kind":"apply_update","category":"blog_goal","value":"говорить своими словами","scope":"global","evidenceType":"explicit_statement","evidenceMessageIds":["${input.userMessageId}"],"confidence":0.9,"operation":"replace_explicit"}`;
}

export function profileChecklistPrompt(
  fields: { id: string; text: string; usage: string }[],
  input: { mode: ProfileDialogueMode; understood?: string; openQuestions?: string[] },
): string {
  return profileV04UserPrompt({
    slice: {},
    published: input.mode === "amend",
    recentText: "",
    authorText: fields.map((field) => `${field.id}: ${field.text}`).join("\n"),
    userMessageId: "msg",
  });
}

import { z } from "zod";
import { PROFILE_FIELD_IDS, PROFILE_USAGES, type ProfileFieldId } from "@/types/profile";
import { sanitizePortraitPatch } from "@/lib/profile-portrait";

export const PROFILE_DIALOGUE_KIND = "profile_dialogue";

export const PROFILE_DIALOGUE_SYSTEM = `Ты Vocal. Собираешь портрет автора для сценариев.
Задавай один вопрос за раз. Не выдумывай биографию, факты, опыт и мотивы.
Не заполняй пустые поля догадками. Если автор не хочет тему — запиши это в boundaries.
Если автор явно разрешил использовать факт в тексте ролика — usage in_text, иначе understanding.
Продолжай уточнять, пока покрытия недостаточно для полезного портрета. Не требуй все восемь пунктов любой ценой.
Верни только JSON.`;

export const profileReplySchema = z.object({
  reply: z.string().min(1),
  coveredKeys: z.array(z.string()).optional(),
  missingKeys: z.array(z.string()).optional(),
  patch: z.unknown().optional(),
  complete: z.boolean().optional(),
});

export type ProfileAiReply = {
  reply: string;
  coveredKeys: ProfileFieldId[];
  missingKeys: ProfileFieldId[];
  patch: ReturnType<typeof sanitizePortraitPatch>;
  complete: boolean;
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

export function parseProfileAiReply(raw: unknown): ProfileAiReply {
  const parsed = profileReplySchema.parse(raw);
  const patch = sanitizePortraitPatch(parsed.patch);
  return {
    reply: parsed.reply.trim(),
    coveredKeys: asFieldIds(parsed.coveredKeys),
    missingKeys: asFieldIds(parsed.missingKeys),
    patch,
    complete: parsed.complete === true,
  };
}

export function profileChecklistPrompt(fields: { id: string; text: string; usage: string }[]): string {
  const lines = fields.map((field) => `- ${field.id}: ${field.text.trim() || "(пусто)"} [${field.usage}]`);
  return `Внутренний checklist (не показывай как форму): ${PROFILE_FIELD_IDS.join(", ")}
Допустимые usage: ${PROFILE_USAGES.join(", ")}
Текущие поля:
${lines.join("\n")}
JSON: {"reply":"","coveredKeys":[],"missingKeys":[],"patch":{},"complete":false}`;
}

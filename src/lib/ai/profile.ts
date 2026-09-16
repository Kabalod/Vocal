import { z } from "zod";
import { PROFILE_FIELD_IDS, PROFILE_FIELD_LABELS, PROFILE_USAGES, type ProfileDialogueMode, type ProfileFieldId } from "@/types/profile";
import { sanitizeFieldOperations, sanitizePortraitPatch } from "@/lib/profile-portrait";

export const PROFILE_DIALOGUE_KIND = "profile_dialogue";

export const PROFILE_DIALOGUE_SYSTEM = `Ты Vocal. Собираешь или уточняешь портрет автора для сценариев.
Задавай один понятный вопрос за раз. Не выдумывай биографию, факты, опыт и мотивы.
Не копируй переписку в поля целиком: запиши обработанный смысл.
Не заполняй пустые поля догадками. Отказ отвечать допустим.
В patch и operations обязательно пиши смысл в text или value, а не один usage.
Личный факт не становится публичной историей сам: usage in_text только если автор явно разрешил, иначе understanding.
Верни только JSON.
Поля checklist: ${PROFILE_FIELD_IDS.join(", ")}.
Операции: {"field":"audience","op":"set","text":"…","usage":"understanding"} | {"field":"audience","op":"clear"} | {"field":"audience","op":"usage","usage":"in_text"}.
Неоднозначное «убери это» не очищай: спроси, что именно убрать, complete=false.
Задавай только один смысловой вопрос в reply. Не объединяй аудиторию, темы и границы в одной реплике.
complete=true и kind=ready означают черновик к явному подтверждению автора, а не уже действующий портрет.
kind: "clarify" если нужен ещё вопрос, "ready" если можно показать черновик к подтверждению.`;

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

export function profileChecklistPrompt(
  fields: { id: string; text: string; usage: string }[],
  input: { mode: ProfileDialogueMode; understood?: string; openQuestions?: string[] },
): string {
  const lines = fields.map((field) => `- ${field.id}: ${field.text.trim() || "(пусто)"} [${field.usage}]`);
  const pending =
    input.mode === "amend"
      ? `Режим: изменение существующего портрета. Действующий результат не меняй, пока kind=ready и complete=true.\nУже понятый запрос: ${input.understood?.trim() || "(пока нет)"}\nОткрытые вопросы: ${(input.openQuestions ?? []).join("; ") || "(нет)"}`
      : "Режим: первая анкета. complete=true только когда понятны цель автора и аудитория или темы, нет противоречия, и можно собрать полезный портрет. Число ответов само по себе не завершает.";
  return `${pending}
Внутренний checklist (не показывай как форму): ${PROFILE_FIELD_IDS.join(", ")}
Допустимые usage: ${PROFILE_USAGES.join(", ")}
Текущие поля:
${lines.join("\n")}
JSON: {"reply":"Для кого это?","kind":"clarify","complete":false,"understood":"","openQuestions":[],"operations":[{"field":"whyRecord","op":"set","text":"говорить своими словами","usage":"understanding"}],"patch":{}}`;
}

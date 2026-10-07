import type { AgentAction } from "@/lib/agent-action";
import type { GapKind, ThoughtGap } from "@/lib/thought-state";

/** R3: internal ids must never reach the author. Shapes: cuid, fact_<id>, gap_<kind>, craft_<id>. */
const ID_SHAPES = [/\bc[a-z0-9]{24}\b/, /\bfact_[A-Za-z0-9_-]+/, /\bgap_[A-Za-z0-9_-]+/, /\bcraft_[A-Za-z0-9_]+/];

/** Fields that are ids by design and are not shown to the author. */
const SERVICE_FIELDS = new Set(["action", "gapId", "evidenceRefs", "checkedInTranscript"]);

export function authorFacingTexts(action: AgentAction): string[] {
  return Object.entries(action)
    .filter(([key, value]) => !SERVICE_FIELDS.has(key) && typeof value === "string")
    .map(([, value]) => value as string);
}

export function textLeaksServiceId(text: string, knownIds: (string | null | undefined)[] = []): boolean {
  if (ID_SHAPES.some((shape) => shape.test(text))) return true;
  return knownIds.some((id) => Boolean(id) && id!.length >= 8 && text.includes(id!));
}

export function actionLeaksServiceId(action: AgentAction, knownIds: (string | null | undefined)[] = []): boolean {
  return authorFacingTexts(action).some((text) => textLeaksServiceId(text, knownIds));
}

export const REGENERATE_NOTE =
  "\n\nПредыдущий ответ содержал служебные идентификаторы. Идентификаторы служебные: не упоминай их в тексте для автора. Верни ответ заново.";

export const GENERIC_NEUTRAL_QUESTION = "Что для вас здесь главное своими словами?";

const NEUTRAL_QUESTIONS: Record<GapKind, string> = {
  no_episode: "О каком одном конкретном случае вы сейчас думаете?",
  no_thesis: "Какую одну мысль вы хотите, чтобы зритель унёс?",
  facts_vs_interpretation: "Что в этом случае было видно со стороны, а что вы к нему добавляете сами?",
  no_mechanism: "Почему, по-вашему, так получается?",
  unclear_terms: "Чем для вас отличаются эти два понятия, когда вы видите их в жизни?",
  repeat_unchecked: "Был ли похожий случай ещё раз?",
  no_boundary: "В какой ситуации это не сработает?",
  no_audience: "Кому вы это говорите в кадре?",
  multiple_topics: "Какую одну тему из названных вы хотите сказать сейчас?",
  promise_unclear: "Что зритель поймёт после этого ролика?",
};

/** A model-free replacement for a reply that leaked ids: one neutral question about the first open gap. */
export function neutralQuestionReply(openGaps: ThoughtGap[]): Record<string, unknown> {
  const gap = openGaps.filter((row) => row.status === "open").sort((a, b) => a.id.localeCompare(b.id))[0] ?? null;
  const question = gap?.kind ? NEUTRAL_QUESTIONS[gap.kind] : GENERIC_NEUTRAL_QUESTION;
  return {
    action: "ask_question",
    question,
    ...(gap ? { gapId: gap.id } : { clarificationReason: "нужно уточнение задачи" }),
    whyUnknown: "ответ с служебными данными заменён нейтральным вопросом",
    thoughtUpdate: { fact: null, closeGapIds: [] },
  };
}

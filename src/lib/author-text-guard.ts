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

/** R5: said first when the server itself returns the author from an off-topic message. No model call. */
export const OFF_TOPIC_RETURN_PHRASE = "Это в сторону от нашей мысли, давайте вернёмся к ней.";

export function withOffTopicPhrase(question: string): string {
  return `${OFF_TOPIC_RETURN_PHRASE} ${question}`;
}

/** 09.10 (A5): said once per thought in front of a question after two dry answers. */
export const DRYNESS_HINT = "Чем подробнее ваши ответы, тем лучше получится сценарий для рилс.";

export function stripOffTopicPhrase(question: string): string {
  let out = question;
  if (out.startsWith(DRYNESS_HINT)) out = out.slice(DRYNESS_HINT.length).trim();
  return out.startsWith(OFF_TOPIC_RETURN_PHRASE) ? out.slice(OFF_TOPIC_RETURN_PHRASE.length).trim() : out;
}

export const GENERIC_NEUTRAL_QUESTION = "Что для вас здесь главное своими словами?";

/** 08.10: a thought's title usable as a topic in a server question; auto titles and empty ones are not. */
export function cleanTopic(title: string | null | undefined): string | null {
  const text = (title ?? "").replace(/\s+/g, " ").trim().replace(/[«»"]/g, "");
  if (!text || /^(сырой дубль|без названия|новая мысль|черновик)/i.test(text)) return null;
  return text.length > 60 ? `${text.slice(0, 57).trim()}…` : text;
}

/**
 * Server questions (08.10 owner rules): one question, plain words, no "по вашему мнению / по-вашему / пожалуйста /
 * конкретн* / позиция / вывод / урок / тезис", the thought's topic named when there is one.
 */
const NEUTRAL_QUESTIONS: Record<GapKind, (topic: string | null) => string> = {
  no_episode: (topic) => `Расскажите в деталях, какой случай${topic ? ` про «${topic}»` : ""} ярко вспоминается?`,
  no_thesis: (topic) => `Что зритель должен унести из ролика${topic ? ` про «${topic}»` : ""}?`,
  facts_vs_interpretation: () => "Что в этом случае было видно со стороны?",
  no_mechanism: (topic) => `Как это происходит${topic ? ` в теме «${topic}»` : ""}, шаг за шагом?`,
  unclear_terms: () => "Чем для вас отличаются эти два понятия, когда вы видите их в жизни?",
  repeat_unchecked: () => "Был ли похожий случай ещё раз?",
  no_boundary: () => "В какой ситуации это не сработает?",
  no_audience: () => "Кому вы это говорите в кадре?",
  multiple_topics: () => "Какую одну тему из названных вы хотите сказать сейчас?",
  promise_unclear: () => "Что зритель поймёт после этого ролика?",
  viewer_effect: () => "Что должен почувствовать или сделать зритель после этого ролика?",
};

function neutralQuestionText(kind: GapKind | null | undefined, topic: string | null | undefined): string {
  if (!kind) return GENERIC_NEUTRAL_QUESTION;
  return NEUTRAL_QUESTIONS[kind](topic ?? null);
}

const CONTENT_TOKEN_MIN = 3;
/** 09.10: 0.7 -> 0.55 (tuned on recorded dialogues: catches rephrased repeats at 0.56-0.62, leaves narrowing questions at 0.50 alone). */
export const REPEAT_SIMILARITY = 0.55;

function contentTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[^a-zа-я0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length >= CONTENT_TOKEN_MIN),
  );
}

/** R5: two questions that say the same thing (Jaccard of content words), including a verbatim repeat. */
export function questionsAreNearDuplicates(a: string, b: string): boolean {
  const left = contentTokens(a);
  const right = contentTokens(b);
  if (left.size === 0 || right.size === 0) return a.trim().toLowerCase() === b.trim().toLowerCase();
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / (left.size + right.size - shared) >= REPEAT_SIMILARITY;
}

export const REPEAT_QUESTION_NOTE =
  "\n\nТы повторяешь недавний вопрос. После неинформативного ответа не повторяй вопрос дословно: сузь его до одного конкретного случая («какой один случай…») или предложи продолжить. Верни ответ заново.";

export const VARIETY_FALLBACKS = [
  GENERIC_NEUTRAL_QUESTION,
  "Какой случай вы бы рассказали в деталях?",
  "Хотите продолжить с этой мыслью или записать следующий дубль?",
];

/**
 * A model-free replacement for a reply that leaked ids or repeated itself: one neutral question about the first open gap
 * whose question is not a near duplicate of the questions to avoid.
 */
export function neutralQuestionReply(
  openGaps: ThoughtGap[],
  avoidQuestions: string[] = [],
  avoidGapIds: string[] = [],
  topic: string | null = null,
): Record<string, unknown> {
  const open = openGaps.filter((row) => row.status === "open").sort((a, b) => a.id.localeCompare(b.id));
  const fresh = (question: string) => !avoidQuestions.some((old) => questionsAreNearDuplicates(question, old));
  const askable = (row: ThoughtGap) => fresh(neutralQuestionText(row.kind, topic));
  // Prefer a gap nobody asked about lately; otherwise any gap whose question is fresh.
  const gap = open.find((row) => !avoidGapIds.includes(row.id) && askable(row)) ?? open.find(askable) ?? null;
  if (!gap && avoidQuestions.length) {
    const question = VARIETY_FALLBACKS.find(fresh) ?? VARIETY_FALLBACKS[VARIETY_FALLBACKS.length - 1];
    return {
      action: "ask_question",
      question,
      clarificationReason: "нужно уточнение задачи",
      whyUnknown: "вопрос повторялся и заменён нейтральным",
      thoughtUpdate: { fact: null, closeGapIds: [] },
    };
  }
  const question = neutralQuestionText(gap?.kind, topic);
  return {
    action: "ask_question",
    question,
    ...(gap ? { gapId: gap.id } : { clarificationReason: "нужно уточнение задачи" }),
    whyUnknown: "ответ с служебными данными заменён нейтральным вопросом",
    thoughtUpdate: { fact: null, closeGapIds: [] },
  };
}

/**
 * content_sufficient shows the model's whyNoGaps to the author. Not replaced: filtered. Sentences that carry an internal id
 * or service wording (gap, field names, JSON) are dropped and the rest is kept; if nothing is left the caller falls back.
 */
const SERVICE_WORDS = /\b(gap|gapid|thoughtupdate|c00signal|evidencerefs|checkedintranscript|json|state)\b|пробел\w*/i;

export function filterServiceProse(text: string, knownIds: (string | null | undefined)[] = []): { text: string; dropped: number } {
  const sentences = text.split(/(?<=[.!?…])\s+/).map((part) => part.trim()).filter(Boolean);
  // A one-word remainder ("См.") is what is left of a sentence that pointed at an id: dropped as well.
  const kept = sentences.filter((sentence) => !textLeaksServiceId(sentence, knownIds) && !SERVICE_WORDS.test(sentence) && sentence.split(/\s+/).length >= 2);
  return { text: kept.join(" "), dropped: sentences.length - kept.length };
}

/**
 * 09.10 owner rule: the introductory fillers "по вашему мнению", "по-вашему", "пожалуйста" are cut from the model's text
 * shown to the author, with the commas and the capital letter repaired. Server-side, no model call. "конкретн*" and every
 * other word is left alone. Display only: the stored action keeps the model's original text.
 */
const FILLER = "(?:по вашему мнению|по-вашему|пожалуйста)";
const WORDS_BEFORE_COMMA = /^[^,]*$/;

export function stripStyleFillers(text: string): string {
  let out = text;
  const re = (pattern: string) => new RegExp(pattern, "iu");
  for (let guard = 0; guard < 6 && re(`(?<![\\p{L}-])${FILLER}(?![\\p{L}-])`).test(out); guard += 1) {
    const before = out;
    // start of the reply: "Пожалуйста, расскажите" / "По вашему мнению, почему"
    out = out.replace(re(`^\\s*${FILLER}\\s*,?\\s*`), "");
    // between commas: "Что, по вашему мнению, вызывает" -> "Что вызывает"; "Если вы уверены, пожалуйста, объясните" -> "Если вы уверены, объясните"
    out = out.replace(re(`([^,?.!]*),\\s*${FILLER}\\s*,\\s*`), (_m, head: string) => (WORDS_BEFORE_COMMA.test(head) && head.trim().split(/\s+/).length <= 1 ? `${head} ` : `${head}, `));
    // end of the reply: "Почему так, по вашему мнению?" / "Расскажите, пожалуйста."
    out = out.replace(re(`\\s*,?\\s*${FILLER}\\s*(?=[?.!…]\\s*$)`), "");
    // an opening comma only: "Расскажите, пожалуйста подробнее"
    out = out.replace(re(`,\\s*${FILLER}\\s+`), " ");
    // no commas at all: "Что по вашему мнению вызывает"
    out = out.replace(re(`(?<=\\s)${FILLER}\\s+`), "");
    if (out === before) break;
  }
  out = out.replace(/\s+([?.!,…])/g, "$1").replace(/\s{2,}/g, " ").replace(/,\s*,/g, ",").replace(/^[\s,]+/, "").trim();
  return out.length > 0 && out !== text ? out.charAt(0).toUpperCase() + out.slice(1) : out;
}

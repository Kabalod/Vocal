/**
 * 09.10 turn policy (R, "rich author" work): what the server does with the model's reply depending on how much material the
 * author has given. No model call here: the functions read the thought state and the dialogue history and, when a rule fires,
 * return a fixed author-facing question that replaces (or is put in front of) the model's own.
 *
 * Material states (criterion proposed in R_REPORT.md):
 *  - insufficient (Н): no accepted author fact and no author position.
 *  - enough (Д): at least one accepted author fact.
 *  - ready (Г): enough, plus a case (>= 2 facts, no open no_episode), a main thought (no open no_thesis), a named final action
 *    (takeTask or a suggest_take seen in this thought) and the viewer effect named or skipped (asked and answered, or intent set).
 *
 * Fixed phrases avoid the style words (по вашему мнению / по-вашему / пожалуйста / конкретн* / вывод / урок / позиция / тезис),
 * carry one question each and do not reproach the author.
 */
import { prisma } from "@/lib/db";
import { meaningfulWords, newContentWords } from "@/lib/author-speech";
import { DRYNESS_HINT } from "@/lib/author-text-guard";
import type { ThoughtFact, ThoughtGap } from "@/lib/thought-state";

/** Kill switch (and isolation for older suites): VOCAL_TURN_POLICY=0 turns the reply policy and the question guards off. On by default. */
export function turnPolicyEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.VOCAL_TURN_POLICY !== "0";
}

export type MaterialState = "insufficient" | "enough" | "ready";

export const POLICY_MARKS = {
  endAsk: "policy_end_ask",
  endAck: "policy_end_ack",
  offer: "policy_understanding_offer",
  noFactNotice: "policy_no_fact_notice",
  pause: "policy_dontknow_pause",
  effectAsk: "policy_effect_ask",
  dryness: "policy_dryness_hint",
  suggestReplaced: "policy_suggest_replaced",
} as const;

/** A2: shown once when two answers in a row added no accepted fact; the same text blocks the build button in state Н. */
export const NO_FACT_NOTICE =
  "Ответы пока не добавляют материала, и улучшить сценарий не получится. Что выберете: рассказать один случай, записать ещё дубль или закончить?";
/** A1: why the build button is blocked in state Н, and the question next to it. */
export const THIN_BLOCK_REASON = "Основа вашего дубля сохранена. Чтобы собрать новый сценарий, нужен хотя бы один ваш ответ по сути.";
export const THIN_NEXT_QUESTION = "Расскажете один случай по этой мысли или запишете ещё один дубль?";
/** A4 */
export const END_ASK_THIN =
  "Пока в мысли нет ни одного вашего ответа по сути, и сценарий собрать не из чего. Закончим на этом?";
export const END_ACK = "Хорошо, мысль остаётся как есть, ничего не создано. Вернуться к ней можно в любой момент.";
/** A3 */
export const DONT_KNOW_PAUSE = "Можно сделать паузу и вернуться к мысли позже. Или назовите одну деталь, с которой можно начать?";
/** A7 */
export const EFFECT_QUESTION = "Что должен почувствовать или сделать зритель после этого ролика?";
/** A5: put in front of the next question, once per thought. */
export { DRYNESS_HINT };

/** A5: an answer of at most this many words is "short" (chosen on recorded dialogues, see R_REPORT.md). */
export const SHORT_ANSWER_WORDS = 11;
export const NO_FACT_STREAK_LIMIT = 2;

const COMMAND = /^(уточни|уточнить|уточни ещё|продолжай|дальше)[.!]?$/i;
export function isCommandText(text: string): boolean {
  return COMMAND.test(text.trim());
}
export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
/** 09.10: words after cutting fillers ("ну", "как бы", "короче", "типа") and self-repeats: what the thresholds are applied to. */
export function speechWords(text: string): number {
  return meaningfulWords(text).length;
}
/** "Не знаю" and empty-ish answers: they carry no material. */
export function isDontKnow(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/ё/g, "е");
  if (!t || /^[\s.?!…,-]*$/.test(t)) return true;
  return /^(не знаю|не помню|не думал[аи]?|затрудняюсь|без понятия|не уверен[а]?|пока не знаю)[,.!…]?(\s+\S+){0,3}[.!…]*$/.test(t) && wordCount(t) <= 5;
}
const END_PHRASES =
  /^(хочу закончить|давайте закончим|давай закончим|закончим|закончить|на этом все|на этом всё|это все|это всё|хватит|главное (я )?(уже )?сказал[аи]?|больше (ничего )?нечего( добавить)?|больше добавить нечего|мне больше нечего сказать|можно заканчивать)[.!…]*$/;
export function isEndPhrase(text: string): boolean {
  return END_PHRASES.test(text.trim().toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " "));
}
/**
 * An answer "по сути" without an accepted fact: more than SHORT_ANSWER_WORDS words and not "не знаю", a command or an end phrase.
 * Measured on the rich-author run: the model accepted a fact from only about a third of long answers, so a missing fact must not
 * make a long answer count as "adds nothing".
 */
export function isSubstantiveAnswer(text: string, question?: string): boolean {
  if (speechWords(text) <= SHORT_ANSWER_WORDS || isDontKnow(text) || isCommandText(text) || isEndPhrase(text)) return false;
  // 09.10 (E6): a long answer that only restates the question adds fewer than four new content words.
  return question ? newContentWords(text, question) >= MIN_NEW_CONTENT_WORDS : true;
}
export const MIN_NEW_CONTENT_WORDS = 4;

export function isYes(text: string): boolean {
  return /^(да|ага|угу|ок|окей|хорошо|давайте|давай|можно|да, закончим|да, давайте)[.!]*$/i.test(text.trim());
}

export type PolicyTurn = { role: "user" | "assistant"; id: string; body: string; marks: string[]; action: string; gapId?: string };

export type PolicyState = {
  facts: Pick<ThoughtFact, "id" | "sourceId" | "text">[];
  position: string;
  intent: string;
  takeTask: string;
  openGaps: Pick<ThoughtGap, "id" | "status" | "kind">[];
};

export function materialState(input: { state: PolicyState; units: number; actionNamed: boolean; effectResolved: boolean }): MaterialState {
  const { state } = input;
  if (input.units === 0 && state.facts.length === 0 && !state.position.trim()) return "insufficient";
  const open = (kind: string) => state.openGaps.some((gap) => gap.status === "open" && gap.kind === kind);
  const caseKnown = input.units >= 2 && !open("no_episode");
  const thesisKnown = !open("no_thesis");
  const actionKnown = Boolean(state.takeTask.trim()) || input.actionNamed;
  return caseKnown && thesisKnown && actionKnown && input.effectResolved ? "ready" : "enough";
}

export type ReplyShape = { kind: "ask_question" | "suggest_take" | "content_sufficient" | "redirect_to_task"; hasFact: boolean; hasSignal: boolean; serverMade: boolean };

export type PolicyDecision =
  | { kind: "replace"; question: string; marks: string[] }
  /** G6: a second offer to build before two new accepted facts: the caller replaces the reply with another question. */
  | { kind: "suppress"; marks: string[] }
  | { kind: "prefix"; phrase: string; marks: string[] };

/** Consecutive latest author answers (commands skipped) with no accepted fact; the current answer counts as accepted when the reply carries a fact. */
function questionBefore(turns: PolicyTurn[], index: number): string | undefined {
  for (let i = index - 1; i >= 0; i -= 1) if (turns[i].role === "assistant") return turns[i].body;
  return undefined;
}

export function noFactStreak(turns: PolicyTurn[], factSources: Set<string>): number {
  let streak = 0;
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const turn = turns[i];
    if (turn.role !== "user" || isCommandText(turn.body)) continue;
    if (factSources.has(turn.id) || isSubstantiveAnswer(turn.body, questionBefore(turns, i))) break;
    streak += 1;
  }
  return streak;
}

/** Author answers that carry material: an accepted fact or a substantive answer. */
export function materialUnits(turns: PolicyTurn[], factSources: Set<string>): number {
  return turns.filter((turn, i) => turn.role === "user" && !isCommandText(turn.body) && (factSources.has(turn.id) || isSubstantiveAnswer(turn.body, questionBefore(turns, i)))).length;
}

function lastIndex<T>(list: T[], pick: (item: T) => boolean): number {
  for (let i = list.length - 1; i >= 0; i -= 1) if (pick(list[i])) return i;
  return -1;
}

export function decideTurnPolicy(input: {
  /** All turns of the thread in order; the last one is the current author message. */
  turns: PolicyTurn[];
  state: PolicyState;
  reply: ReplyShape;
  /** composeUnderstanding(state with the reply's fact) or null. */
  understanding: string | null;
}): PolicyDecision | null {
  const { turns, state, reply } = input;
  if (reply.hasSignal || reply.serverMade || reply.kind === "redirect_to_task") return null;
  const current = turns[turns.length - 1];
  if (!current || current.role !== "user") return null;
  const askable = reply.kind === "ask_question" || reply.kind === "suggest_take";
  const lastAssistant = [...turns].reverse().find((turn) => turn.role === "assistant");
  const marksOfLast = lastAssistant?.marks ?? [];
  const replaceMarks = (...marks: string[]) => (reply.kind === "suggest_take" ? [...marks, POLICY_MARKS.suggestReplaced] : marks);

  const factSources = new Set(state.facts.map((fact) => fact.sourceId));
  if (reply.hasFact) factSources.add(current.id);
  const factsAfter = state.facts.length + (reply.hasFact ? 1 : 0);
  const unitsAfter = materialUnits(turns, factSources);
  const actionNamed = turns.some((turn) => turn.role === "assistant" && (turn.action === "suggest_take" || turn.marks.includes(POLICY_MARKS.suggestReplaced))) || reply.kind === "suggest_take";
  const stateAfterNoEffect = { ...state, facts: new Array(factsAfter).fill(null).map((_, i) => state.facts[i] ?? { id: "new", sourceId: current.id, text: "" }) };

  // A4: "хочу закончить" and its confirmation.
  if (isYes(current.body) && marksOfLast.includes(POLICY_MARKS.endAsk)) {
    return { kind: "replace", question: END_ACK, marks: [POLICY_MARKS.endAck] };
  }
  if (isEndPhrase(current.body)) {
    if (unitsAfter === 0 && !state.position.trim()) {
      if (marksOfLast.includes(POLICY_MARKS.endAsk) || marksOfLast.includes(POLICY_MARKS.endAck)) return { kind: "replace", question: END_ACK, marks: [POLICY_MARKS.endAck] };
      return { kind: "replace", question: END_ASK_THIN, marks: [POLICY_MARKS.endAsk] };
    }
    if (input.understanding) return { kind: "replace", question: input.understanding, marks: replaceMarks(POLICY_MARKS.offer) };
    return null;
  }

  if (!askable) return null;

  // A2: two answers in a row without an accepted fact, once until the next fact.
  const streak = noFactStreak(turns, factSources);
  const lastFactUser = lastIndex(turns, (turn) => turn.role === "user" && factSources.has(turn.id));
  const noticeAfterFact = lastIndex(turns, (turn) => turn.role === "assistant" && turn.marks.includes(POLICY_MARKS.noFactNotice)) > lastFactUser;
  if (!reply.hasFact && streak >= NO_FACT_STREAK_LIMIT && !noticeAfterFact) {
    return { kind: "replace", question: NO_FACT_NOTICE, marks: replaceMarks(POLICY_MARKS.noFactNotice) };
  }

  // A3: two "не знаю" in a row: no second request for an example.
  const answers = turns.filter((turn) => turn.role === "user" && !isCommandText(turn.body));
  const previous = answers[answers.length - 2];
  if (isDontKnow(current.body) && previous && isDontKnow(previous.body) && !marksOfLast.includes(POLICY_MARKS.pause)) {
    return { kind: "replace", question: DONT_KNOW_PAUSE, marks: replaceMarks(POLICY_MARKS.pause) };
  }

  // A7: the viewer effect, once per thought, when there is a case and a main thought and the goal is not named yet.
  const effectAsked = turns.some((turn) => turn.role === "assistant" && turn.marks.includes(POLICY_MARKS.effectAsk));
  const open = (kind: string) => state.openGaps.some((gap) => gap.status === "open" && gap.kind === kind);
  const effectResolved = Boolean(state.intent.trim()) || effectAsked;
  if (!effectAsked && !state.intent.trim() && unitsAfter >= 2 && !open("no_episode") && !open("no_thesis") && !isDontKnow(current.body)) {
    return { kind: "replace", question: EFFECT_QUESTION, marks: replaceMarks(POLICY_MARKS.effectAsk) };
  }

  // A6 / G6: ready to offer the build instead of one more question. Offered once; again only after two new accepted facts.
  // An offer is the "what we have" reply and also a shown suggest_take ("записать дубль или собрать сценарий").
  const lastOffer = lastIndex(turns, (turn) => turn.role === "assistant" && (turn.marks.includes(POLICY_MARKS.offer) || turn.action === "suggest_take"));
  const factsSinceOffer = lastOffer < 0 ? Infinity : turns.slice(lastOffer + 1).filter((turn) => turn.role === "user" && factSources.has(turn.id)).length;
  const offerAllowed = factsSinceOffer >= 2;
  const after = materialState({ state: stateAfterNoEffect as PolicyState, units: unitsAfter, actionNamed, effectResolved });
  if (after === "ready" && input.understanding && offerAllowed) {
    return { kind: "replace", question: input.understanding, marks: replaceMarks(POLICY_MARKS.offer) };
  }
  if (reply.kind === "suggest_take" && !offerAllowed) return { kind: "suppress", marks: [POLICY_MARKS.suggestReplaced, "policy_offer_suppressed"] };

  // A5: dry answers, once per thought, put in front of the next question.
  if (reply.kind === "ask_question" && !turns.some((turn) => turn.role === "assistant" && turn.marks.includes(POLICY_MARKS.dryness))) {
    const [a, b] = [answers[answers.length - 2], answers[answers.length - 1]];
    if (a && b && speechWords(a.body) <= SHORT_ANSWER_WORDS && speechWords(b.body) <= SHORT_ANSWER_WORDS && !isDontKnow(a.body) && !isDontKnow(b.body)) {
      return { kind: "prefix", phrase: DRYNESS_HINT, marks: [POLICY_MARKS.dryness] };
    }
  }
  return null;
}

/** Turns of a thread with the markers each assistant reply carries (discardedUpdates) and its action. */
export async function loadPolicyTurns(threadId: string): Promise<PolicyTurn[]> {
  const rows = await prisma.dialogueMessage.findMany({
    where: { threadId, OR: [{ role: "user" }, { role: "assistant", status: "done" }] },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, body: true, payloadJson: true },
  });
  return rows.map((row) => {
    let marks: string[] = [];
    let action = "";
    let gapId: string | undefined;
    if (row.role === "assistant") {
      try {
        const payload = JSON.parse(row.payloadJson) as { action?: { action?: string; gapId?: string }; discardedUpdates?: unknown };
        marks = Array.isArray(payload.discardedUpdates) ? (payload.discardedUpdates as string[]) : [];
        action = payload.action?.action ?? "";
        gapId = payload.action?.gapId;
      } catch {
        // an unreadable payload carries no markers
      }
    }
    return { role: row.role as "user" | "assistant", id: row.id, body: row.body, marks, action, gapId };
  });
}

// ---- Question guards (A8 echo, A10 content hints). Offline-measurable, no model. -------------------------------------

const wordsOf = (text: string): string[] => text.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9\s]/g, " ").split(/\s+/).filter(Boolean);
const contentWords = (text: string): Set<string> => new Set(wordsOf(text).filter((word) => word.length >= 4));

/** A8: the question's own words are (almost) all already in the author's last answers: it asks what was just said. */
export const ECHO_CONTAINMENT = 0.75;
export const ECHO_MIN_WORDS = 5;
export function questionEchoesAuthor(question: string, lastAnswers: string[]): boolean {
  const q = contentWords(question);
  if (q.size < ECHO_MIN_WORDS) return false;
  const answered = contentWords(lastAnswers.join(" "));
  let shared = 0;
  for (const word of q) if (answered.has(word)) shared += 1;
  return shared / q.size >= ECHO_CONTAINMENT;
}

const ADJECTIVE_END = /(ые|ие|ий|ой|ая|ое|ых|их|ные|ские|ский|ская|ское)$/;
/** A10: "биологические или психологические механизмы": the question lists answers the author did not name. */
export function questionOffersAlternatives(question: string, authorWords: string): boolean {
  const known = contentWords(authorWords);
  for (const match of question.toLowerCase().replace(/ё/g, "е").matchAll(/([а-я]{7,})\s+или\s+([а-я]{7,})/g)) {
    const [, a, b] = match;
    if (ADJECTIVE_END.test(a) && ADJECTIVE_END.test(b) && !known.has(a) && !known.has(b)) return true;
  }
  return false;
}

const ROLE_PHRASE = /(в вашей практике|в вашей работе|при работе с\s+\S+|как (?:врач|специалист|нутрициолог|эксперт|психолог|тренер))/i;
const ROLE_STEMS = /практик|работ|врач|специалист|нутрициолог|эксперт|психолог|тренер|пациент|клиент/i;
/** A10: the question puts a role or circumstances on the author that the author's answers never named. */
export function questionAssumesRole(question: string, authorAnswers: string): boolean {
  return ROLE_PHRASE.test(question) && !ROLE_STEMS.test(authorAnswers);
}

export function questionNeedsHintCheck(question: string, authorAnswers: string): "alternatives" | "role" | null {
  if (questionOffersAlternatives(question, authorAnswers)) return "alternatives";
  if (questionAssumesRole(question, authorAnswers)) return "role";
  return null;
}

// ---- E4: a "new" fact that only repeats what is already known ----------------------------------------------------------

const wordSet = (text: string): Set<string> => new Set(meaningfulWords(text).filter((w) => w.length >= 4));
function shareIn(part: Set<string>, whole: Set<string>): number {
  if (part.size === 0) return 1;
  let shared = 0;
  for (const w of part) if (whole.has(w)) shared += 1;
  return shared / part.size;
}

/**
 * The model sometimes attaches a fact to the current message that is really the text of an earlier answer or fact
 * (rich-author finding: P4 turn 10, P6 turns 5-7). A fact is a duplicate when it is (a) nearly the same as an accepted fact, or
 * (b) mostly absent from the current message and mostly present in earlier author text.
 */
export function isDuplicateFact(factText: string, currentMessage: string, earlierTexts: string[], acceptedFacts: string[]): boolean {
  const fact = wordSet(factText);
  if (fact.size < 3) return false;
  for (const known of acceptedFacts) {
    const other = wordSet(known);
    if (shareIn(fact, other) >= 0.8 && shareIn(other, fact) >= 0.6) return true;
  }
  const inCurrent = shareIn(fact, wordSet(currentMessage));
  if (inCurrent >= 0.4) return false;
  return earlierTexts.some((text) => shareIn(fact, wordSet(text)) >= 0.7);
}

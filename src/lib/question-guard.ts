/**
 * 09.10 (G1-G6): checks of the question the service is about to show, and the fixed replacements. Model-free.
 *
 *  - G1 topic repeat: a new question repeats the topic of a question the author already answered, or asks about what the
 *    author already told (stems of the first five letters of the content words, so Russian endings do not hide a repeat).
 *    Thresholds were tuned on the recorded rich-author dialogues of run 3 (P1, P2, P3, P4) - see R_REPORT.md.
 *  - G2 forbidden lexicon, length (<= 15 words), one question per reply.
 *  - G4 genre of the author's take: story, humor, explanation, advice; per-genre bans and replacement questions.
 *  - G6 the "what we have so far" reply: second person list in the author's words, <= 45 words.
 */
import { isCommandText, isDontKnow, isEndPhrase } from "@/lib/turn-policy";
import { meaningfulWords } from "@/lib/author-speech";

// ---- stems -------------------------------------------------------------------------------------------------------------

const STOP = new Set(
  "что как это для или при тоже вот там тут был была было были будет есть нет уже ещё еще если когда потому чтобы очень просто только можно надо все мне меня мой моя мои вас вам вы мы они вашего вашей ваши ваш вашим можете почему именно какой какая какое какие каких какого каким которые которая который объяснить расскажите опишите привести ответьте скажите после этого этой этих этот эта более такой такие также".split(" "),
);
/** Words every template question has: they say nothing about the topic. */
const TEMPLATE_STEMS = new Set(["приме", "случа", "конкр", "приве", "расск", "описа", "объяс", "скажи", "моме", "одним", "один"]);

export function questionStems(text: string): Set<string> {
  const out = new Set<string>();
  for (const word of text.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9\s]/g, " ").split(/\s+/)) {
    if (word.length < 4 || STOP.has(word)) continue;
    const stem = word.slice(0, 5);
    if (!TEMPLATE_STEMS.has(stem)) out.add(stem);
  }
  return out;
}

const share = (part: Set<string>, whole: Set<string>): number => {
  if (part.size === 0) return 0;
  let n = 0;
  for (const x of part) if (whole.has(x)) n += 1;
  return n / part.size;
};

// ---- G1 ----------------------------------------------------------------------------------------------------------------

/** vs a past question the author answered: at least 3 shared stems and half of the smaller question. */
export const PAST_QUESTION_SHARED = 3;
export const PAST_QUESTION_SHARE = 0.5;
/** vs everything the author told: at least 6 stems in the question and 70 % of them already in the answers. */
export const TOLD_MIN_STEMS = 6;
export const TOLD_SHARE = 0.7;

export type TopicRepeat = "past_question" | "already_told" | "viewer_again" | "closed_topic" | null;

/**
 * H3: "не помню / не знаю" closes the topic. An answer with fewer than four meaningful words once the "don't know" phrase and the
 * fillers are cut says nothing: the question is answered with "unknown", and its relatives are not asked again.
 */
const DONT_KNOW_PHRASES = /не помню|не знаю|не думал[аи]?(?:\s+об\s+этом)?|не обращал[аи]?\s+внимани[яе]|не могу сказать|затрудняюсь|без понятия|точно\s+не|честно\s+говоря|честно/giu;
export function isUnknownAnswer(text: string): boolean {
  const rest = text.replace(DONT_KNOW_PHRASES, " ");
  return meaningfulWords(rest).length < 4;
}

/** Relatives of a closed question: two shared stems and 40 % of the smaller one ("впервые / обычно", "что сказала / какой комментарий делала"). */
export const CLOSED_SHARED = 2;
export const CLOSED_SHARE = 0.4;

export function topicRepeat(input: {
  question: string;
  /** Past questions of this thought whose answer carried material. */
  answeredQuestions: string[];
  /** All past questions (answered or not): used only for the viewer rule. */
  allQuestions: string[];
  /** Past questions whose answer was "unknown" (H3). */
  closedQuestions?: string[];
  /** Everything the author said so far. */
  authorTexts: string[];
}): TopicRepeat {
  const stems = questionStems(input.question);
  for (const closed of input.closedQuestions ?? []) {
    const other = questionStems(closed);
    let shared = 0;
    for (const s of stems) if (other.has(s)) shared += 1;
    if (shared >= CLOSED_SHARED && shared / Math.min(stems.size, other.size) >= CLOSED_SHARE) return "closed_topic";
  }
  if (/зрител/i.test(input.question) && input.allQuestions.some((q) => /зрител/i.test(q))) return "viewer_again";
  for (const past of input.answeredQuestions) {
    const other = questionStems(past);
    let shared = 0;
    for (const s of stems) if (other.has(s)) shared += 1;
    if (shared >= PAST_QUESTION_SHARED && shared / Math.min(stems.size, other.size) >= PAST_QUESTION_SHARE) return "past_question";
  }
  const told = new Set<string>();
  for (const text of input.authorTexts) for (const s of questionStems(text)) told.add(s);
  if (stems.size >= TOLD_MIN_STEMS && share(stems, told) >= TOLD_SHARE) return "already_told";
  return null;
}

// ---- G4 genre ----------------------------------------------------------------------------------------------------------

export type Genre = "story" | "humor" | "explanation" | "advice";

const HUMOR = /(?<![\p{L}])(?:смешн|шутк|шутил|ржал|ржач|прикол|анекдот|хаха|ирони|угар|комичн|курьез|забавн|юмор|нелеп)/gu;
const STORY = /(?<![\p{L}\d])(?:я|мы)\s+(?:\p{L}+\s+)?\p{L}+(?:л|ла|ли|ло)(?![\p{L}\d])|(?<![\p{L}\d])(?:вчера|однажды|в прошлом году|в марте|в январе|в феврале|в апреле|в мае)(?![\p{L}\d])/gu;
const ADVICE = /(?<![\p{L}\d])\p{L}+(?:йте|ите)(?![\p{L}\d])|(?<![\p{L}\d])(?:советую|рекомендую|надо|стоит|запомните)(?![\p{L}\d])/gu;
const EXPLAIN = /вот почему|потому что|поэтому|причина|дело в том|это значит|то есть|например|во-первых|во-вторых|не нужно|не стоит/g;

/**
 * Genre by the author's words. The take counts three times as much as the answers: it is the author's own framing. A regex cannot
 * see a joke that is not marked as one, so a funny story without humor words is read as a story.
 */
export function detectGenre(texts: string[]): Genre {
  const [take = "", ...answers] = texts;
  const norm = (t: string) => t.toLowerCase().replace(/ё/g, "е");
  const count = (re: RegExp) => ((norm(take).match(re) ?? []).length * 3) + (norm(answers.join(" ")).match(re) ?? []).length;
  const humor = count(HUMOR);
  if (humor >= 3) return "humor";
  const story = count(STORY);
  const advice = count(ADVICE);
  const explain = count(EXPLAIN);
  if (explain > story && explain >= advice) return "explanation";
  if (advice > story && advice > explain) return "advice";
  return story > 0 || explain === 0 ? "story" : "explanation";
}

export function genreRule(genre: Genre): string {
  switch (genre) {
    case "humor":
      return "Жанр дубля: юмор. Не спрашивай про вывод, позицию, условия или «когда не сработает». Можно спросить про самый смешной момент, что было дальше, что сказали.";
    case "story":
      return "Жанр дубля: личная история. Не спрашивай про вывод, позицию, условия или «когда не сработает». Можно спросить про самый яркий момент, что было дальше, что сказали.";
    case "explanation":
      return "Жанр дубля: объяснение. Спроси про пример, на котором это видно.";
    case "advice":
      return "Жанр дубля: совет. Спроси, что человеку сделать завтра утром.";
  }
}

// ---- G2 ----------------------------------------------------------------------------------------------------------------

export const MAX_QUESTION_WORDS = 15;

const FORBIDDEN: { code: string; re: RegExp }[] = [
  { code: "механизм", re: /механизм/i },
  { code: "позиция", re: /позици/i },
  { code: "вывод", re: /вывод/i },
  { code: "в теме «", re: /в теме\s*[«"]/i },
  { code: "шаг за шагом", re: /шаг за шагом/i },
  { code: "когда не сработает", re: /(?:в какой ситуации|когда)[^?]*не сработает/i },
  { code: "при каких условиях", re: /при каких условиях/i },
  { code: "донести из", re: /донести из/i },
  { code: "унести из", re: /унести из/i },
  { code: "каким образом … приводит", re: /каким образом[^?]*приводит/i },
];
/** Extra bans for story and humor. */
const FORBIDDEN_FOR_STORY = /услови|эффективн|не сработает|в какой ситуации/i;

export type QuestionProblem = { code: string } | null;

/** H6: the author is addressed with "вы". "ты/тебя/твой" and a singular past form after "вы" ("вы сделал") are not allowed. */
const TY = /(?<![\p{L}\d])(?:ты|тебя|тебе|тобой|твой|твоя|твоё|твое|твои|твоей|твоего|твоих|твоим)(?![\p{L}\d])/iu;
const VY_SINGULAR = /(?<![\p{L}\d])вы\s+(?:\p{L}+\s+)?\p{L}{3,}(?:л|ла|ло)(?![\p{L}\d])/iu;
/** H5: small talk about trifles instead of speech, a number or a reaction. */
const PETTY = /в каком (?:месяце|году|числе)|какого цвета|какой (?:именно )?(?:цвет|овощ|фрукт|продукт|день недели)(?![\p{L}])|как именно (?:вы\s+)?(?:прикреп|повес|полож|постав|закреп)\p{L}*|во сколько именно/iu;

export function questionHasAnchor(question: string, anchorTexts: string[]): boolean {
  const stems = questionStems(question);
  if (stems.size === 0) return false;
  const anchors = new Set<string>();
  for (const text of anchorTexts) for (const stem of questionStems(text)) anchors.add(stem);
  for (const stem of stems) if (anchors.has(stem)) return true;
  return false;
}

export function questionProblem(
  question: string,
  ctx: { genre: Genre; lastAnswer?: string; /** H4: the take, the title and the last two answers */ anchorTexts?: string[]; /** H7: the last author message is a command such as "уточни" */ lastIsCommand?: boolean },
): QuestionProblem {
  if (TY.test(question) || VY_SINGULAR.test(question)) return { code: "ты или род" };
  if (/[«"]уточни[»"]/i.test(question) || (ctx.lastIsCommand && /что (?:ты|вы) имел/i.test(question))) return { code: "команда принята за речь" };
  if (PETTY.test(question)) return { code: "мелочь" };
  for (const rule of FORBIDDEN) {
    if (!rule.re.test(question)) continue;
    // "шаг за шагом" is allowed when the author told a process (the word "шаг" or "сначала … потом" is in the last answer)
    if (rule.code === "шаг за шагом" && ctx.lastAnswer && /шаг|сначала/i.test(ctx.lastAnswer)) continue;
    return { code: rule.code };
  }
  if ((ctx.genre === "story" || ctx.genre === "humor") && FORBIDDEN_FOR_STORY.test(question)) return { code: `жанр ${ctx.genre}` };
  if (question.trim().split(/\s+/).length > MAX_QUESTION_WORDS) return { code: "длина" };
  if (ctx.anchorTexts && !questionHasAnchor(question, ctx.anchorTexts)) return { code: "без опоры" };
  if ((question.match(/\?/g) ?? []).length > 1) return { code: "несколько вопросов" };
  return null;
}

export const REGENERATE_QUESTION_NOTE = (code: string, genre: Genre): string =>
  `\n\nВопрос не прошёл проверку (${code}). Задай один вопрос до ${MAX_QUESTION_WORDS} слов обычными словами, про самую яркую деталь из последнего ответа автора, без слов: механизм, позиция, вывод, «в теме», «шаг за шагом», «при каких условиях». ${genreRule(genre)}`;

export type QuestionRulesVariant = "off" | "short" | "full";

/**
 * VOCAL_QUESTION_RULES: "0"/"off" = A (server guards only), "full" = C (the long block), anything else, including unset, = B (the
 * two-sentence block, the fact rule first). B is the default since 09.10 (H1: 51 % of calls return a fact against 16 % for A and 7 % for C).
 */
export function questionRulesVariant(env: Record<string, string | undefined> = process.env): QuestionRulesVariant {
  const raw = env.VOCAL_QUESTION_RULES?.trim().toLowerCase();
  if (raw === "0" || raw === "off") return "off";
  if (raw === "full" || raw === "1") return "full";
  return "short";
}

const FACT_RULE = "Если в ответе автора есть новое содержательное утверждение, верни его словами автора в thoughtUpdate.fact.";

/** G3 + G2 + G4 (+ H5, H6) rules for the model, one block in the prompt. Variant B is the two-sentence version, the fact rule first. */
export function questionRulesBlock(genre: Genre, variant: QuestionRulesVariant = "full"): string {
  if (variant === "off") return "";
  if (variant === "short") {
    return [FACT_RULE, "Спрашивай про самую яркую деталь из последнего ответа автора (число, имя, реплика).", "Обращайся на «вы», без «ты»."].join(" ");
  }
  return [
    `Правила вопроса: один вопрос, до ${MAX_QUESTION_WORDS} слов, обычными словами.`,
    "Спроси о самой яркой конкретной детали из последнего ответа автора (число, имя, предмет, реплика), например: «А что сказала Тётя Люба?», «Почему именно четверо из двенадцати бросили?».",
    "Не спрашивай мелочи («в каком месяце», «какой именно овощ или цвет», «как именно прикрепил»). Предпочитай детали с речью, числом или реакцией: «что сказал», «сколько», «что вы почувствовали».",
    "Не спрашивай «почему» или «как» про то, что автор уже объяснил. Не повторяй тему вопроса, на который автор уже ответил. Если автор ответил «не помню» или «не знаю», эту тему не возвращай.",
    "Не используй слова: механизм, позиция, вывод, «в теме», «шаг за шагом», «при каких условиях», «донести из», «унести из», «каким образом … приводит».",
    "В вопросе должно быть слово из дубля или из двух последних ответов автора.",
    "Обращайся к автору на «вы», никогда на «ты»; не используй форм «вы сделал/сделала». Если сообщение автора — просто команда («уточни»), задай первый вопрос по материалу дубля, а не про это слово.",
    FACT_RULE,
    genreRule(genre),
  ].join(" ");
}

// ---- fallback questions (wording proposed for approval, see R_REPORT.md G5) --------------------------------------------

/** H4: every replacement names the thought. Wording of the kind templates: see G5 in R_REPORT.md. */
export function anchoredByKind(kind: string, topic: string | null): string | null {
  const t = topic ? ` про «${topic}»` : "";
  switch (kind) {
    case "no_episode": return `Какой случай${t} вы помните лучше всего?`;
    case "no_thesis": return topic ? `О чём главное в ролике про «${topic}»?` : null;
    case "facts_vs_interpretation": return `Что вы сами видели или слышали${t}?`;
    case "no_mechanism": return topic ? `Что на самом деле происходит с «${topic}»?` : null;
    case "unclear_terms": return topic ? `Что вы имеете в виду под словами из ролика про «${topic}»?` : null;
    case "repeat_unchecked": return `Бывало ли так ещё раз${t}?`;
    case "no_boundary": return topic ? `Для кого «${topic}» точно не подойдёт?` : null;
    case "no_audience": return topic ? `Кому вы рассказываете про «${topic}»?` : null;
    case "multiple_topics": return topic ? `О чём из этого снимем ролик про «${topic}»?` : null;
    case "promise_unclear": return topic ? `Что человек получит, дослушав про «${topic}» до конца?` : null;
    case "viewer_effect": return topic ? `Что человек должен сделать после ролика про «${topic}»?` : null;
    default: return null;
  }
}

export function anchoredByGenre(genre: Genre, topic: string | null): string[] {
  const t = topic ? ` про «${topic}»` : "";
  switch (genre) {
    case "humor": return [`Какой момент${t} был самым смешным?`, `Что было дальше${t}?`];
    case "story": return [`Что было дальше в истории${t}?`, `Какой момент${t} был самым ярким?`];
    case "explanation": return [`На каком примере видно, как это работает${t}?`];
    case "advice": return [`Что человеку сделать завтра утром${t}?`];
  }
}

/** The first replacement that is not a repeat of a past question. */
export function pickFallback(candidates: string[], pastQuestions: string[]): string | null {
  for (const candidate of candidates) {
    const stems = questionStems(candidate);
    const repeated = pastQuestions.some((q) => {
      const other = questionStems(q);
      let shared = 0;
      for (const s of stems) if (other.has(s)) shared += 1;
      return stems.size > 0 && shared / stems.size >= 0.8;
    });
    if (!repeated && !pastQuestions.includes(candidate)) return candidate;
  }
  return null;
}

// ---- G6 ----------------------------------------------------------------------------------------------------------------

export const UNDERSTANDING_MAX_WORDS = 45;
const ITEM_MAX_WORDS = 12;
const TAIL_STOP = new Set(["и", "а", "но", "что", "как", "в", "на", "с", "к", "по", "потому", "чтобы", "когда", "или", "же", "бы", "я", "мы", "из", "у", "о", "от", "для", "то", "не"]);

const LEADING = new Set(["знаете", "вот", "так", "значит", "конечно", "да", "слушайте", "понимаете", "смотрите"]);

function shorten(text: string): string {
  const words = meaningfulWords(text);
  while (words.length > 0 && LEADING.has(words[0])) words.shift();
  if (words.length < 4) return "";
  const cut = words.slice(0, ITEM_MAX_WORDS);
  while (cut.length > 3 && TAIL_STOP.has(cut[cut.length - 1])) cut.pop();
  return cut.join(" ") + (words.length > cut.length ? "…" : "");
}

/** Up to three short points in the author's own words: accepted facts written in the author's voice first, then the latest substantive answers. */
export function understandingItems(facts: string[], answers: string[]): string[] {
  const picked: string[] = [];
  const add = (text: string) => {
    const item = shorten(text);
    if (item && !picked.some((p) => questionStems(p).size > 0 && share(questionStems(item), questionStems(p)) >= 0.8)) picked.push(item);
  };
  for (const fact of [...facts].reverse()) {
    if (picked.length >= 3) break;
    if (/^\s*(автор|зритель|человек|пользователь)\b/i.test(fact)) continue;
    add(fact);
  }
  for (const answer of [...answers].reverse()) {
    if (picked.length >= 3) break;
    if (isCommandText(answer) || isDontKnow(answer) || isEndPhrase(answer)) continue;
    add(answer);
  }
  let total = 6; // "Пока у нас так:" + "Собрать сценарий?"
  const out: string[] = [];
  for (const item of picked.reverse()) {
    const n = item.split(/\s+/).length + 1; // the dash counts as a word
    if (total + n > UNDERSTANDING_MAX_WORDS) break;
    out.push(item);
    total += n;
  }
  return out;
}

export function composeUnderstandingList(facts: string[], answers: string[]): string | null {
  const items = understandingItems(facts, answers);
  if (items.length === 0) return null;
  return `Пока у нас так:\n${items.map((item) => `— ${item}`).join("\n")}\nСобрать сценарий?`;
}

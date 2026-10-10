/**
 * Speech-to-text hygiene (09.10, "transcript mode"). Almost all voice reaches the model as a transcript: no punctuation to
 * rely on, filler words ("ну", "как бы", "короче", "типа"), self-repeats and broken phrases. These helpers are deterministic and
 * model-free. They never rewrite what the author said in the stored dialogue; they clean what the server derives from it
 * (accepted facts, the script input and output, the "meaningful words" count).
 */

/**
 * H9: only the exact form "(факт N)" in parentheses is cut (what the simulated author wrote into its answers). "пункт 3",
 * "в третьем пункте", "[факт 3]" and a bare "факт 5" are ordinary speech and stay.
 */
const SERVICE_MARK = /\(\s*факт\s+\d+\s*\)/giu;

export function stripServiceMarks(text: string): string {
  return text
    .replace(SERVICE_MARK, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.!?;:…])/g, "$1")
    .replace(/,\s*,/g, ",")
    .trim();
}

/** Filler phrases (matched on the word level, lower case) and single filler words. "вот" and "значит" are left alone: ambiguous. */
const FILLER_PHRASES: string[][] = [
  ["ну", "вот"],
  ["как", "бы"],
  ["так", "сказать"],
  ["это", "самое"],
  ["в", "общем-то"],
  ["короче", "говоря"],
];
const FILLER_WORD = /^(?:ну|короче|типа|эм+|э+|э(?:-э)+|м+|ммм+|ээ+|блин|ладно-ладно)$/u;

const bare = (token: string): string => token.toLowerCase().replace(/ё/g, "е").replace(/^[^\p{L}\d-]+|[^\p{L}\d-]+$/gu, "");
const trailing = (token: string): string => token.match(/[,.!?;:…]+$/u)?.[0] ?? "";

/** Drops fillers and immediate self-repeats (1-5 words said twice in a row). Keeps the author's own words. */
export function removeFillers(text: string): string {
  const raw = text.split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  let capitalizeNext = false; // only after a dropped filler at the start of a sentence: the author's own capitals are left alone
  let i = 0;
  while (i < raw.length) {
    const word = bare(raw[i]);
    // multi-word fillers
    const phrase = FILLER_PHRASES.find((p) => p.every((w, k) => i + k < raw.length && bare(raw[i + k]) === w));
    if (phrase) {
      const last = raw[i + phrase.length - 1];
      const end = trailing(last);
      if (/[.!?…]/.test(end) && kept.length) kept[kept.length - 1] += end.replace(/,+/g, "");
      if (/[.!?…]/.test(end) || kept.length === 0) capitalizeNext = true;
      i += phrase.length;
      continue;
    }
    if (FILLER_WORD.test(word)) {
      const end = trailing(raw[i]);
      if (/[.!?…]/.test(end) && kept.length) kept[kept.length - 1] += end.replace(/,+/g, "");
      if (/[.!?…]/.test(end) || kept.length === 0) capitalizeNext = true;
      i += 1;
      continue;
    }
    // self-repeats: n-gram (3, 2, 1) equal to the previous one
    let dropped = 0;
    for (const n of [5, 4, 3, 2, 1]) {
      if (i + n <= raw.length && kept.length >= n) {
        const prev = kept.slice(-n).map(bare);
        const next = raw.slice(i, i + n).map(bare);
        if (prev.every((w, k) => w && w === next[k])) {
          dropped = n;
          break;
        }
      }
    }
    if (dropped) {
      const end = trailing(raw[i + dropped - 1]);
      if (end && kept.length) kept[kept.length - 1] = kept[kept.length - 1].replace(/[,.!?;:…]+$/u, "") + end;
      i += dropped;
      continue;
    }
    let token = raw[i];
    if (capitalizeNext && /^\p{L}/u.test(token)) token = token.charAt(0).toUpperCase() + token.slice(1);
    capitalizeNext = false;
    kept.push(token);
    i += 1;
  }
  return kept.join(" ").replace(/\s+([,.!?;:…])/g, "$1").replace(/,\s*([.!?…])/g, "$1").replace(/^[,\s]+/, "").trim();
}

/** Words that carry meaning: the text without fillers and self-repeats, lower case, letters only. */
export function meaningfulWords(text: string): string[] {
  return removeFillers(stripServiceMarks(text))
    .toLowerCase()
    .replace(/ё/g, "е")
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, ""))
    .filter(Boolean);
}

const STOP = new Set(["что", "это", "как", "так", "его", "она", "они", "оно", "для", "или", "при", "тоже", "вот", "там", "тут", "был", "была", "было", "были", "будет", "есть", "нет", "уже", "ещё", "еще", "если", "когда", "потому", "чтобы", "очень", "просто", "только", "можно", "надо", "всё", "все", "мне", "меня", "мой", "моя", "мои", "вас", "вам", "вы", "мы", "они"]);

/** Distinct content words (4+ letters, not in the stop list) of the text that the other text does not contain. */
export function newContentWords(text: string, other: string): number {
  const known = new Set(meaningfulWords(other));
  const fresh = new Set(meaningfulWords(text).filter((w) => w.length >= 4 && !STOP.has(w) && !known.has(w)));
  return fresh.size;
}

/** removeFillers per line: paragraph breaks of a script or a list are kept. */
export function cleanSpeechText(text: string): string {
  return text
    .split("\n")
    .map((line) => removeFillers(stripServiceMarks(line)))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** E3: a "what changed" item describes an edit of the text and starts with an editing verb. */
const EDIT_VERB = /^(?:убрал|удалил|добавил|вставил|объединил|склеил|переставил|перенёс|перенес|сократил|исправил|поправил|заменил|уточнил|оставил|разбил|вынес|выделил|сохранил|перефразировал|упростил|развернул|дополнил|изменил|написал|привёл|привел|оформил|разделил|подчеркнул)(?![\p{L}])/iu;
export function changeLooksLikeEdit(item: string): boolean {
  return EDIT_VERB.test(item.trim());
}
export const NO_EDIT_LIST_FALLBACK = "Правок в тексте нет, он собран из ваших слов.";

// ---- H2: normalization of a transcript before facts are extracted (no model) -------------------------------------------

/** Words that usually open a new sentence in speech that has no punctuation. */
const SENTENCE_OPENERS = new Set(["потом", "тогда", "поэтому", "затем", "наконец", "сначала", "теперь", "зато", "однако", "итак", "вдруг", "после"]);
const MIN_SENTENCE_WORDS = 7;
/** A sentence does not end on these words (a pronoun, a preposition, a conjunction): the break waits for the next opener. */
const SENTENCE_TAIL_BLOCK = new Set(["я", "и", "а", "но", "в", "на", "с", "к", "по", "за", "у", "о", "от", "до", "что", "как", "мы", "он", "она", "они", "не", "то", "же"]);

/**
 * Transcript normalization: service marks, fillers and self-repeats out; in text with (almost) no punctuation, sentence
 * boundaries are restored before the usual openers ("потом", "тогда", "поэтому", …) once a sentence has 7+ words; every sentence
 * starts with a capital letter and ends with a full stop. Words are never changed or added. The stored message is not touched.
 */
export function normalizeTranscript(text: string): string {
  const cleaned = removeFillers(stripServiceMarks(text));
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const marks = (cleaned.match(/[.!?…]/g) ?? []).length;
  if (marks * 25 >= words.length) return cleaned; // already punctuated enough
  const sentences: string[][] = [[]];
  for (const word of words) {
    const current = sentences[sentences.length - 1];
    const bare = word.toLowerCase().replace(/[^\p{L}-]/gu, "");
    const previous = (current[current.length - 1] ?? "").toLowerCase().replace(/[^\p{L}-]/gu, "");
    if (current.length >= MIN_SENTENCE_WORDS && SENTENCE_OPENERS.has(bare) && !SENTENCE_TAIL_BLOCK.has(previous)) sentences.push([word]);
    else current.push(word);
  }
  return sentences
    .map((sentence) => {
      const joined = sentence.join(" ").replace(/[,;:]+$/u, "");
      const capital = joined.charAt(0).toUpperCase() + joined.slice(1);
      return /[.!?…]$/.test(capital) ? capital : `${capital}.`;
    })
    .join(" ");
}

// ---- I2: a short verbatim quote for a fact ---------------------------------------------------------------------------------

const QUOTE_MAX_WORDS = 30;
const QUOTE_MIN_FACT_OVERLAP = 0.5;

function stemSet(text: string): Set<string> {
  return new Set(meaningfulWords(text).filter((w) => w.length >= 4).map((w) => w.slice(0, 5)));
}

/**
 * The part of the author's own message (cleaned of fillers and repeats) that the fact is about (I2c). Null when the fact is not mostly
 * a restatement of this message: a fact the author corrected or replaced has little in common with the message it points to, so the
 * retracted wording cannot come back through a quote.
 *
 * Choice: the message is cut at the normalized sentence boundaries; a long sentence is cut into windows of at most 30 words that
 * start at the sentence start or after a conjunction. A window loses its leading discourse words ("знаете", "честно говоря"…) and a
 * trailing conjunction/preposition. Rejected: a window shorter than 6 words, a window with a stray digit ("3 а…") near the end or
 * a digit followed by a one-letter word, a window that still ends on a hanging word. Among the rest the one that covers most of the fact
 * wins, with a bonus for a concrete detail (a number, a spoken line, a name, a past action).
 */
export function factQuote(factText: string, rawMessage: string): string | null {
  const message = materialAfterDontKnow(rawMessage);
  if (!message) return null;
  const fact = stemSet(factText);
  const whole = stemSet(message);
  if (fact.size === 0 || whole.size === 0) return null;
  let inMessage = 0;
  for (const stem of fact) if (whole.has(stem)) inMessage += 1;
  if (inMessage / fact.size < QUOTE_MIN_FACT_OVERLAP) return null;
  const sentences = normalizeTranscript(message).split(/(?<=[.!?…])\s+/).filter(Boolean);
  let best: { text: string; score: number } | null = null;
  for (const sentence of sentences) {
    for (const raw of quoteCandidates(sentence)) {
      const hard = raw.startsWith(HARD_CUT);
      const candidate = hard ? raw.slice(1) : raw;
      const stems = stemSet(candidate);
      let overlap = 0;
      for (const stem of fact) if (stems.has(stem)) overlap += 1;
      if (overlap === 0) continue;
      const score = overlap + 0.5 * Math.min(2, detailFeatures(candidate, message)) - (hard ? 1 : 0);
      if (!best || score > best.score) best = { text: candidate, score };
    }
  }
  return best ? best.text : null;
}

const INTRO_WORDS = /^(?:знаете|понимаете|слушайте|смотрите|значит|конечно|кстати|вообще|в общем|в принципе|если честно|честно говоря|честно сказать|так вот|ну вот|итак|собственно|короче)[,.\s]+/iu;
const HANGING = new Set(["и", "а", "но", "что", "как", "в", "на", "с", "к", "по", "за", "у", "о", "от", "до", "из", "для", "же", "бы", "то", "или", "когда", "потому", "чтобы", "где", "который", "я", "мы", "он", "она", "они", "не", "ни", "его", "её", "их", "мне", "мой", "моя", "это", "этот", "там", "тут"]);
const SPLIT_AFTER = new Set(["но", "потом", "когда", "тогда", "поэтому"]);
/** A long sentence is cut BEFORE one of these (a clause ends there), not in the middle of a clause. */
const CLAUSE_STARTERS = new Set(["но", "потом", "когда", "тогда", "поэтому", "потому", "чтобы", "а", "и", "после", "так"]);
const MAX_WORDS = QUOTE_MAX_WORDS;
/** Marker for a candidate cut in the middle of a clause; it is scored lower and the marker is removed before use. */
const HARD_CUT = "\u0001";
const MIN_WORDS = 6;

function stripIntro(text: string): string {
  let out = text.trim();
  for (let i = 0; i < 3 && INTRO_WORDS.test(out); i += 1) out = out.replace(INTRO_WORDS, "");
  return out.replace(/^[,;\s]+/, "").replace(/^(?:а|и|ну|так|да)(?![\p{L}])[,\s]+/iu, "");
}

function trimTail(words: string[]): string[] {
  const out = [...words];
  while (out.length > 0 && HANGING.has(out[out.length - 1].toLowerCase().replace(/[^\p{L}]/gu, ""))) out.pop();
  return out;
}

/** A digit that is a fragment: alone in the last four words, or followed by a one-letter word. */
function strayDigitAt(words: string[]): number {
  for (let i = 0; i < words.length; i += 1) {
    if (!/^\d{1,2}$/.test(words[i])) continue;
    const next = (words[i + 1] ?? "").replace(/[^\p{L}]/gu, "");
    if (i >= words.length - 4 || next.length === 1) return i;
  }
  return -1;
}

const MODAL = new Set(["может", "могут", "можно", "должен", "должна", "должны", "нужно", "надо"]);

/** "…может привести" / "…нужно" at the end is a cut-off clause: drop the modal together with its infinitive. */
function trimModalTail(words: string[]): string[] {
  const out = [...words];
  const word = (i: number) => (out[i] ?? "").toLowerCase().replace(/[^\p{L}]/gu, "");
  if (out.length >= 2 && MODAL.has(word(out.length - 2))) out.splice(-2);
  else if (out.length >= 1 && MODAL.has(word(out.length - 1))) out.pop();
  return out;
}

/** A lone 1-2 digit token in a transcript is a list-number artifact ("3 а тётя люба…"): it is a boundary, never part of a quote. */
function quoteCandidates(sentence: string): string[] {
  const parts = sentence.replace(/[.!?…]+$/u, "").split(/(?<![\p{L}\d/])\d{1,2}(?![\p{L}\d/])/u);
  const seenAll = new Set<string>();
  return parts.flatMap((part) => windowCandidates(stripIntro(part))).filter((c) => (seenAll.has(c) ? false : (seenAll.add(c), true)));
}

function windowCandidates(clean: string): string[] {
  const words = clean.split(/\s+/).filter(Boolean);
  const starts = [0];
  for (let i = 0; i < words.length - 1; i += 1) if (SPLIT_AFTER.has(words[i].toLowerCase().replace(/[^\p{L}]/gu, ""))) starts.push(i + 1);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const start of starts) {
    const rest = words.slice(start);
    let end = Math.min(rest.length, MAX_WORDS);
    let hardCut = false;
    if (rest.length > MAX_WORDS) {
      // end before the last clause starter between the 12th and the 30th word; with none, the cut is hard (the candidate is penalized)
      let boundary = -1;
      for (let j = Math.min(MAX_WORDS, rest.length - 1); j >= 12; j -= 1) {
        if (CLAUSE_STARTERS.has(rest[j].toLowerCase().replace(/[^\p{L}]/gu, ""))) { boundary = j; break; }
      }
      if (boundary > 0) end = boundary;
      else hardCut = true;
    }
    let piece = trimTail(rest.slice(0, end));
    const stray = strayDigitAt(piece);
    if (stray >= 0) piece = trimTail(piece.slice(0, stray));
    piece = trimTail(trimModalTail(piece));
    if (piece.length < MIN_WORDS || strayDigitAt(piece) >= 0) continue;
    const text = piece.join(" ");
    if (seen.has(text)) continue;
    seen.add(text);
    out.push((hardCut ? HARD_CUT : "") + text.charAt(0).toUpperCase() + text.slice(1));
  }
  return out;
}

const NUMBER_WORDS = /(?<![\p{L}])(?:один|одна|одно|два|две|три|четыре|пять|шесть|семь|восемь|девять|десять|двенадцать|двадцать|сто|тысяч\p{L}*|пол\p{L}*|первый|первая|первые|второй|третий)(?![\p{L}])/iu;
const SPEECH = /(?<![\p{L}])(?:сказал\p{L}*|ответил\p{L}*|спросил\p{L}*|говорил\p{L}*|говорит|посоветовал\p{L}*|предложил\p{L}*|крикнул\p{L}*|написал\p{L}*)(?![\p{L}])/iu;
const PAST_ACTION = /(?<![\p{L}])\p{L}{3,}(?:л|ла|ли|ло)(?![\p{L}])/u;

/** Concrete detail in a window: a number, a spoken line, a name (a capital letter inside a sentence of the original), a past action. */
function detailFeatures(candidate: string, original: string): number {
  let features = 0;
  if (/\d/.test(candidate) || NUMBER_WORDS.test(candidate)) features += 1;
  if (SPEECH.test(candidate)) features += 1;
  const names = (original.match(/(?<=[\p{L}]\s)[А-ЯЁ][а-яё]{2,}/gu) ?? []).map((n) => n.toLowerCase());
  if (names.some((n) => candidate.toLowerCase().includes(n))) features += 1;
  if (PAST_ACTION.test(candidate)) features += 1;
  return features;
}

/** An answer that opens with "не помню / не знаю / не думал…" (the don't-know clause is at the start). */
export function startsWithDontKnow(text: string): boolean {
  const opening = meaningfulWords(text).slice(0, 6).join(" ");
  return /не помню|не знаю|не думал|не задумывал|затрудняюсь|без понятия/.test(opening);
}

const STILL_UNKNOWN = /не помн|не зна|не думал|не задум|нет ни|нет никак|записях|не фиксиров|не могу|без понятия|затрудня/i;

/**
 * I2b: what is left of an answer for the script. An answer without a don't-know opening is returned as it is. An answer that opens
 * with "не помню имя, но это было в мае" keeps its useful remainder ("это было в мае"): the part after "но / а / зато / ; / —" if it has
 * four or more meaningful words and is not itself a statement of not knowing. Otherwise nothing is left (null).
 */
export function materialAfterDontKnow(text: string): string | null {
  if (!startsWithDontKnow(text)) return text;
  const match = /(?:,|;|—|–|\.)\s*(?:но|а|зато|однако)\s+|\s(?:но|зато|однако)\s+|[;—–.]\s+/iu.exec(text);
  if (!match) return null;
  const rest = text.slice(match.index + match[0].length).trim();
  if (meaningfulWords(rest).length < 4 || STILL_UNKNOWN.test(rest)) return null;
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

// ---- I2b: Latin look-alikes inside Cyrillic words; repeats in a script ------------------------------------------------------

const HOMOGLYPHS: Record<string, string> = {
  a: "а", e: "е", o: "о", p: "р", c: "с", x: "х", y: "у",
  A: "А", B: "В", C: "С", E: "Е", H: "Н", K: "К", M: "М", O: "О", P: "Р", T: "Т", X: "Х", Y: "У",
};

/** A Latin look-alike letter inside a word that has Cyrillic letters is a typo of the model ("Любa" with a Latin a): put the Cyrillic letter. Words fully in Latin are left alone. */
export function fixHomoglyphs(text: string): string {
  return text.replace(/[\p{L}]+/gu, (word) => {
    if (!/[\u0400-\u04FF]/.test(word) || !/[A-Za-z]/.test(word)) return word;
    return word.replace(/[A-Za-z]/g, (ch) => HOMOGLYPHS[ch] ?? ch);
  });
}

function sentenceStems(sentence: string): Set<string> {
  return new Set(meaningfulWords(sentence).filter((w) => w.length >= 4).map((w) => w.slice(0, 5)));
}

const REPEAT_CONTAINMENT = 0.8;
const REPEAT_MIN_STEMS = 4;

function isRepeatOf(candidate: Set<string>, earlier: Set<string>): boolean {
  if (candidate.size < REPEAT_MIN_STEMS) return false;
  let shared = 0;
  for (const stem of candidate) if (earlier.has(stem)) shared += 1;
  return shared / candidate.size >= REPEAT_CONTAINMENT;
}

/**
 * Deterministic, after the model's answer, no new model call: a sentence whose content words (stems of five letters) are 80 % or more
 * contained in an EARLIER sentence is a repeat of a fact or a quote and is dropped; paragraphs and the first occurrence stay.
 */
export function dedupeScript(script: string): { text: string; removed: number } {
  const kept: Set<string>[] = [];
  let removed = 0;
  const lines = script.split("\n").map((line) => {
    const sentences = line.split(/(?<=[.!?…])\s+/).filter(Boolean);
    const out: string[] = [];
    for (const sentence of sentences) {
      const stems = sentenceStems(sentence);
      if (kept.some((earlier) => isRepeatOf(stems, earlier))) {
        removed += 1;
        continue;
      }
      kept.push(stems);
      out.push(sentence);
    }
    return out.join(" ");
  });
  return { text: lines.filter((line, i) => line || (i > 0 && lines[i - 1])).join("\n").trim(), removed };
}

/** How many sentences of a script repeat an earlier one (the same test as dedupeScript). */
export function scriptRepeats(script: string): number {
  return dedupeScript(script).removed;
}

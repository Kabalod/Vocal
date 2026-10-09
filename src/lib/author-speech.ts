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
 * The part of the author's own message (cleaned of fillers and repeats) that the fact is about: the sentence with the largest
 * overlap, at most 30 words. Null when the fact is not mostly a restatement of this message: a fact the author corrected or replaced
 * has little in common with the message it points to, so no quote is made and the retracted wording cannot come back through it.
 */
export function factQuote(factText: string, message: string): string | null {
  const fact = stemSet(factText);
  const whole = stemSet(message);
  if (fact.size === 0 || whole.size === 0) return null;
  let inMessage = 0;
  for (const stem of fact) if (whole.has(stem)) inMessage += 1;
  if (inMessage / fact.size < QUOTE_MIN_FACT_OVERLAP) return null;
  const sentences = normalizeTranscript(message).split(/(?<=[.!?…])\s+/).filter(Boolean);
  let best = "";
  let bestScore = 0;
  for (const sentence of sentences) {
    const stems = stemSet(sentence);
    let score = 0;
    for (const stem of fact) if (stems.has(stem)) score += 1;
    if (score > bestScore) { best = sentence; bestScore = score; }
  }
  if (!best || bestScore === 0) return null;
  const words = best.replace(/[.!?…]+$/u, "").split(/\s+/);
  return words.length > QUOTE_MAX_WORDS ? `${words.slice(0, QUOTE_MAX_WORDS).join(" ")}…` : words.join(" ");
}

/**
 * Speech-to-text hygiene (09.10, "transcript mode"). Almost all voice reaches the model as a transcript: no punctuation to
 * rely on, filler words ("ну", "как бы", "короче", "типа"), self-repeats and broken phrases. These helpers are deterministic and
 * model-free. They never rewrite what the author said in the stored dialogue; they clean what the server derives from it
 * (accepted facts, the script input and output, the "meaningful words" count).
 */

/** "(факт 2)", "[пункт 3]", "(fact 4)": service markers that are never author speech (seen from the simulated author). */
const SERVICE_MARK = /[([]\s*(?:факт|пункт|fact|item)\s*№?\s*\d+(?:\s*[,;и]\s*\d+)*\s*[)\]]/giu;
const BARE_MARK = /(?<![\p{L}\d])(?:факт|пункт)\s*№?\s*\d+(?![\p{L}\d])/giu;

export function stripServiceMarks(text: string): string {
  return text
    .replace(SERVICE_MARK, "")
    .replace(BARE_MARK, "")
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
export const NO_EDIT_LIST_FALLBACK = "Текст собран из ваших слов; список правок модель не дала.";

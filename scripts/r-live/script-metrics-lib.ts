// Metrics for E2 (author's words in the script), computed on raw and on cleaned text. No model.
import { meaningfulWords } from "../../src/lib/author-speech";

const rawTokens = (text: string): string[] =>
  text.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9\s-]/g, " ").split(/\s+/).filter(Boolean);

const words4 = (tokens: string[]): Set<string> => new Set(tokens.filter((w) => w.length >= 4));

/** Non-overlapping windows of 8 tokens: a "phrase" of speech that has no punctuation to split by. */
export function phrases(tokens: string[], size = 8): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < tokens.length; i += size) {
    const chunk = tokens.slice(i, i + size);
    if (chunk.length >= 5) out.push(chunk);
  }
  return out;
}

function share(phraseList: string[][], scriptWords: Set<string>, threshold = 0.7): { found: number; total: number } {
  let found = 0;
  let total = 0;
  for (const phrase of phraseList) {
    const w = words4(phrase);
    if (w.size === 0) continue;
    total += 1;
    let hit = 0;
    for (const x of w) if (scriptWords.has(x)) hit += 1;
    if (hit / w.size >= threshold) found += 1;
  }
  return { found, total };
}

/** Raw: 8-word windows of the answers as spoken (fillers included) against the script as stored. Clean: windows of the
 *  answers after cutting fillers and repeats against the same script. The script is compared by its words in both cases. */
export function phraseShares(answers: string[], script: string) {
  const scriptWords = words4(rawTokens(script));
  const raw = share(answers.flatMap((a) => phrases(rawTokens(a))), scriptWords);
  const clean = share(answers.flatMap((a) => phrases(meaningfulWords(a))), scriptWords);
  return { raw, clean };
}

/** Accepted facts found in the script (>= 70 % of their content words), raw and cleaned fact text. */
export function factShares(facts: string[], script: string) {
  const scriptWords = words4(rawTokens(script));
  const raw = share(facts.map(rawTokens), scriptWords);
  const clean = share(facts.map((f) => meaningfulWords(f)), scriptWords);
  return { raw, clean };
}

const FILLER_TOKEN = /^(?:ну|короче|типа|эм+|э+|э(?:-э)+|ммм+|ээ+|блин)$/;
/** Filler words still present in a script (the script must not carry them). */
export function fillersIn(script: string): number {
  const tokens = rawTokens(script);
  let n = tokens.filter((t) => FILLER_TOKEN.test(t)).length;
  for (let i = 0; i + 1 < tokens.length; i += 1) if (tokens[i] === "как" && tokens[i + 1] === "бы") n += 1;
  return n;
}

const PERSON_WORDS = new Set(["автор", "автора", "автору", "он", "она", "они", "его", "её", "их", "ему", "ей", "мне", "меня", "мой", "моя", "мои", "мы", "нас", "наш", "вы", "вас", "ваш", "себя", "свой", "своя", "свои"]);

/**
 * I2c: facts found in the script by word stems (first five letters), ignoring the person of the sentence ("Автор проиграл…" and
 * "Я проиграл…" are the same fact) and the pronouns: at least 60 % of the fact's stems are in the script. Next to the old, exact-word metric.
 */
export function factSharesStem(facts: string[], script: string): { found: number; total: number } {
  const stems = (text: string) => new Set(rawTokens(text).filter((w) => w.length >= 4 && !PERSON_WORDS.has(w)).map((w) => w.slice(0, 5)));
  const scriptStems = stems(script);
  let found = 0;
  let total = 0;
  for (const fact of facts) {
    const f = stems(fact);
    if (f.size === 0) continue;
    total += 1;
    let hit = 0;
    for (const x of f) if (scriptStems.has(x)) hit += 1;
    if (hit / f.size >= 0.6) found += 1;
  }
  return { found, total };
}

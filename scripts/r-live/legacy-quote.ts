// The quote picker as it was before I2c (kept only for the before/after comparison; not used by the app).
import { meaningfulWords, normalizeTranscript } from "../../src/lib/author-speech";

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
export function legacyFactQuote(factText: string, message: string): string | null {
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


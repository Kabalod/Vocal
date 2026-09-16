import { QUESTIONS_PER_ROUND } from "@/types/review";

export function normalizeQuestionText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

export function uniqueNewQuestions(
  candidates: string[],
  existingTexts: string[],
  limit = QUESTIONS_PER_ROUND,
): string[] {
  const seen = new Set(existingTexts.map(normalizeQuestionText).filter(Boolean));
  const out: string[] = [];
  for (const raw of candidates) {
    const text = raw.trim().replace(/\s+/g, " ");
    if (!text) continue;
    const key = normalizeQuestionText(text);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

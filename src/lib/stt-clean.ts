import type { TranscriptSegment } from "@/types/analysis";

export interface SttLike {
  text: string;
  segments: TranscriptSegment[];
}

const CYR = "а-яёА-ЯЁ";

const CREDIT_LINE =
  /^(?:редактор\s+субтитров|корректор|субтитры\s+(?:создавал|делал|добавил|подготовил|сделал)|продолжение\s+следует|dimatorzok|а\.\s*семкин|а\.\s*егорова)[\s\S]*$/i;

const CREDIT_PHRASE = [
  new RegExp(`редактор\\s+субтитров(?:\\s+[${CYR}a-zA-Z.\\-]+)*\\s*`, "gi"),
  new RegExp(`корректор(?:\\s+[${CYR}a-zA-Z.\\-]+)*\\s*`, "gi"),
  new RegExp(
    `субтитры\\s+(?:создавал|делал|добавил|подготовил|сделал)\\s+[${CYR}a-zA-Z.\\-]*\\s*`,
    "gi",
  ),
  /dimatorzok\s*/gi,
  /а\.\s*семкин\s*/gi,
  /а\.\s*егорова\s*/gi,
  /продолжение\s+следует\.?\s*/gi,
];

export function stripWhisperCredits(text: string): string {
  let next = text;
  for (const pattern of CREDIT_PHRASE) {
    next = next.replace(pattern, " ");
  }
  return next.replace(/\s{2,}/g, " ").replace(/^[\s.,;:–-]+|[\s.,;:–-]+$/g, "").trim();
}

export function isWhisperCreditHallucination(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) return true;
  if (CREDIT_LINE.test(normalized)) return true;
  const cleaned = stripWhisperCredits(text);
  if (!cleaned) return true;
  const removed = text.length - cleaned.length;
  return removed > 0 && cleaned.length / text.length < 0.35;
}

export function cleanSttResult<T extends SttLike>(result: T): T {
  const segments: TranscriptSegment[] = result.segments
    .map((segment) => ({
      ...segment,
      text: stripWhisperCredits(segment.text),
    }))
    .filter((segment) => segment.text.length > 0 && !isWhisperCreditHallucination(segment.text));

  const text =
    segments.map((segment) => segment.text).join(" ").trim() ||
    stripWhisperCredits(result.text);

  return { ...result, text, segments };
}

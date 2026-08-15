import type { AnalysisMetrics, TranscriptSegment } from "@/types/analysis";

const FILLER_PHRASES = ["как бы", "в общем", "это самое", "так сказать"];
const FILLER_WORDS = new Set([
  "ну",
  "вот",
  "типа",
  "короче",
  "значит",
  "ээ",
  "эм",
  "эээ",
  "мм",
  "ммм",
  "а-а",
  "э-э",
]);

const PAUSE_THRESHOLD_SEC = 0.7;
const RUSH_SEGMENT_SEC = 8;
const RUSH_WPM = 190;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .split(/[^a-zа-я0-9-]+/i)
    .filter(Boolean);
}

export function findFillerRanges(
  text: string,
): Array<{ start: number; end: number; token: string }> {
  const ranges: Array<{ start: number; end: number; token: string }> = [];
  const lower = text.toLowerCase().replace(/ё/g, "е");

  for (const phrase of FILLER_PHRASES) {
    let from = 0;
    while (from < lower.length) {
      const idx = lower.indexOf(phrase, from);
      if (idx === -1) break;
      ranges.push({ start: idx, end: idx + phrase.length, token: phrase });
      from = idx + phrase.length;
    }
  }

  const wordRe = /[a-zа-я0-9-]+/gi;
  let match: RegExpExecArray | null;
  while ((match = wordRe.exec(lower)) !== null) {
    if (FILLER_WORDS.has(match[0])) {
      ranges.push({
        start: match.index,
        end: match.index + match[0].length,
        token: match[0],
      });
    }
  }

  return ranges;
}

export function countFillers(text: string): number {
  return findFillerRanges(text).length;
}

export function computeMetrics(
  segments: TranscriptSegment[],
  fullText: string,
  durationSec: number,
): AnalysisMetrics {
  const safeDuration = Math.max(durationSec, 0.1);
  const wordCount = tokenize(fullText).length;
  const wordsPerMinute = wordCount / (safeDuration / 60);

  const pauses: number[] = [];
  for (let i = 1; i < segments.length; i++) {
    const gap = segments[i].start - segments[i - 1].end;
    if (gap >= PAUSE_THRESHOLD_SEC) {
      pauses.push(gap);
    }
  }

  const pauseCount = pauses.length;
  const avgPauseSec =
    pauseCount > 0 ? pauses.reduce((a, b) => a + b, 0) / pauseCount : 0;
  const maxPauseSec = pauseCount > 0 ? Math.max(...pauses) : 0;

  let rushDuration = 0;
  for (const seg of segments) {
    const dur = Math.max(seg.end - seg.start, 0.01);
    if (dur < RUSH_SEGMENT_SEC) continue;
    const wpm = tokenize(seg.text).length / (dur / 60);
    if (wpm >= RUSH_WPM) {
      rushDuration += dur;
    }
  }
  const speechSpan =
    segments.length > 0
      ? Math.max(segments[segments.length - 1].end - segments[0].start, 0.01)
      : safeDuration;

  const fillerCount = countFillers(fullText);
  const fillerPer100Words = wordCount > 0 ? (fillerCount / wordCount) * 100 : 0;

  return {
    durationSec: Number(safeDuration.toFixed(2)),
    wordsPerMinute: Number(wordsPerMinute.toFixed(1)),
    pauseCount,
    avgPauseSec: Number(avgPauseSec.toFixed(2)),
    maxPauseSec: Number(maxPauseSec.toFixed(2)),
    fillerPer100Words: Number(fillerPer100Words.toFixed(2)),
    fillerCount,
    wordCount,
    rushShare: Number((rushDuration / speechSpan).toFixed(3)),
  };
}

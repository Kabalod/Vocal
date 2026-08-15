import fs from "fs";
import { STT_FALLBACK_MODEL, STT_MODEL } from "@/lib/config";
import { getGroq, withRetry } from "@/lib/groq";
import { cleanSttResult } from "@/lib/stt-clean";
import type { TranscriptSegment } from "@/types/analysis";

export interface SttResult {
  text: string;
  segments: TranscriptSegment[];
  language?: string;
  avgNoSpeechProb?: number;
  model: string;
}

interface VerboseSegment {
  start?: number;
  end?: number;
  text?: string;
  no_speech_prob?: number;
}

interface VerboseTranscription {
  text?: string;
  language?: string;
  segments?: VerboseSegment[];
}

async function transcribeOnce(mp3Path: string, model: string): Promise<SttResult> {
  const groq = getGroq();

  const raw = await withRetry(
    () =>
      groq.audio.transcriptions.create({
        file: fs.createReadStream(mp3Path),
        model,
        language: "ru",
        response_format: "verbose_json",
        timestamp_granularities: ["segment", "word"],
        temperature: 0,
        prompt: "Разговорное видео. Живая устная речь на русском языке.",
      }) as Promise<VerboseTranscription>,
    { label: "stt" },
  );

  const text = (raw.text ?? "").trim();
  const segments: TranscriptSegment[] = (raw.segments ?? [])
    .map((s) => ({
      start: Number(s.start ?? 0),
      end: Number(s.end ?? 0),
      text: (s.text ?? "").trim(),
    }))
    .filter((s) => s.text.length > 0);

  const probs = (raw.segments ?? [])
    .map((s) => s.no_speech_prob)
    .filter((n): n is number => typeof n === "number");
  const avgNoSpeechProb =
    probs.length > 0 ? probs.reduce((a, b) => a + b, 0) / probs.length : undefined;

  return {
    text,
    segments,
    language: raw.language,
    avgNoSpeechProb,
    model,
  };
}

function finalize(result: SttResult): SttResult {
  return cleanSttResult(result);
}

export async function transcribeAudio(mp3Path: string): Promise<SttResult> {
  const primary = finalize(await transcribeOnce(mp3Path, STT_MODEL));
  const empty = primary.text.length === 0 || primary.segments.length === 0;
  const likelySilence = (primary.avgNoSpeechProb ?? 0) > 0.8 && primary.text.length < 20;

  if (!empty && !likelySilence) {
    return primary;
  }

  if (STT_MODEL !== STT_FALLBACK_MODEL) {
    const fallback = finalize(await transcribeOnce(mp3Path, STT_FALLBACK_MODEL));
    if (fallback.text.length > 0) {
      return fallback;
    }
  }

  throw Object.assign(new Error("Речь не распознана. Проверьте, что в ролике слышно голос."), {
    code: "NO_SPEECH",
  });
}

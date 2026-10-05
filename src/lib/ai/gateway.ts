import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ownerUserId } from "@/lib/auth/session";
import { LLM_MODEL, STT_MODEL } from "@/lib/config";
import { prisma } from "@/lib/db";
import { extractAudio, probeDuration } from "@/lib/ffmpeg";
import { transcribeAudio } from "@/lib/stt";
import {
  AiBudgetError,
  assertDailySttBudget,
  assertDailyTokenBudget,
  STT_CALL_KIND,
  withAiInflight,
} from "@/lib/ai/usage-guard";
import type { CompleteJsonFn } from "@/types/review";

/**
 * Single server gateway for every outbound model / STT call:
 * budget per owner → deadline → accounting row. Never logs prompts or author text.
 */

export class AiTimeoutError extends Error {
  readonly code = "AI_TIMEOUT";
  readonly status = 504;
  constructor(message = "Модель не ответила вовремя. Повторите позже.") {
    super(message);
    this.name = "AiTimeoutError";
  }
}

function envMs(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export function aiOperationTimeoutMs() {
  return envMs("VOCAL_AI_TIMEOUT_MS", 90_000);
}

export function sttOperationTimeoutMs() {
  return envMs("VOCAL_STT_TIMEOUT_MS", 300_000);
}

export function maxVoiceBytes() {
  return envMs("VOCAL_MAX_VOICE_MB", 15) * 1024 * 1024;
}

export function maxVoiceSeconds() {
  return envMs("VOCAL_MAX_VOICE_SECONDS", 180);
}

export async function withDeadline<T>(run: () => Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(onTimeout()), ms);
  });
  try {
    return await Promise.race([run(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Callers that already write their own AiCall row with tokens on success. */
const SELF_RECORDING_LABELS = new Set(["dialogue", "profile_dialogue", "script", "thought-title"]);

function estimateTokens(chars: number) {
  return Math.max(1, Math.ceil(chars / 3));
}

type GatewayCompleteArgs = Parameters<CompleteJsonFn>[0];

/**
 * Chat gateway: budget check before the call (429 + zero external calls), one deadline for the
 * whole operation, accounting for paths that do not own an AiCall row, and a charge for failed
 * calls that reached the provider.
 */
export async function gatewayComplete(
  complete: CompleteJsonFn,
  args: GatewayCompleteArgs,
  opts: { reelId?: string | null } = {},
): Promise<Awaited<ReturnType<CompleteJsonFn>>> {
  await assertDailyTokenBudget();
  const label = args.label ?? "chat";
  const selfRecording = SELF_RECORDING_LABELS.has(label);
  const owner = ownerUserId();
  const promptChars = args.system.length + args.user.length;
  try {
    const result = await withDeadline(
      () => complete(args),
      aiOperationTimeoutMs(),
      () => new AiTimeoutError(),
    );
    if (!selfRecording) {
      await recordCall({
        kind: label,
        owner,
        reelId: opts.reelId,
        model: args.model ?? LLM_MODEL,
        status: "done",
        promptTokens: result.usage?.promptTokens ?? estimateTokens(promptChars),
        completionTokens: result.usage?.completionTokens ?? estimateTokens(result.text.length),
      });
    }
    return result;
  } catch (error) {
    // Failed calls still cost quota. Self-recording callers leave tokens null on error rows,
    // so charge an estimate on a separate row instead of double-counting successes.
    await recordCall({
      kind: selfRecording ? `${label}_failed` : label,
      owner,
      reelId: opts.reelId,
      model: args.model ?? LLM_MODEL,
      status: "error",
      promptTokens: estimateTokens(promptChars),
      completionTokens: 0,
      errorMessage: error instanceof Error ? error.name : "error",
    }).catch(() => undefined);
    throw error;
  }
}

async function recordCall(input: {
  kind: string;
  owner: string;
  reelId?: string | null;
  model: string;
  status: "done" | "error";
  promptTokens: number;
  completionTokens: number;
  errorMessage?: string;
  turnKey?: string;
  responseText?: string;
  snapshot?: Record<string, unknown>;
}) {
  return prisma.aiCall.create({
    data: {
      kind: input.kind,
      reelId: input.reelId ?? null,
      model: input.model,
      status: input.status,
      ownerUserId: input.owner,
      promptText: "",
      inputSnapshotJson: JSON.stringify(input.snapshot ?? { gateway: true }),
      responseText: input.responseText ?? null,
      errorMessage: input.errorMessage ?? null,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      turnKey: input.turnKey ?? null,
    },
  });
}

/** Audio length: ffprobe when possible, otherwise a size-based upper estimate (~128 kbit/s). */
export async function audioSeconds(mp3Path: string, fallbackBytes?: number): Promise<number> {
  try {
    const seconds = await probeDuration(mp3Path);
    if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds);
  } catch {
    /* fall through to estimate */
  }
  try {
    const bytes = fallbackBytes ?? (await stat(mp3Path)).size;
    return Math.max(1, Math.ceil(bytes / 16_000));
  } catch {
    return 1;
  }
}

type SttImpl = typeof transcribeAudio;

/**
 * STT gateway: daily seconds budget before the call, one deadline, accounting row for the
 * outcome (failures are charged too). `seconds` skips probing when the caller already knows it.
 */
export async function meteredTranscribe(
  mp3Path: string,
  impl: SttImpl = transcribeAudio,
  opts: { seconds?: number; reelId?: string | null } = {},
): Promise<Awaited<ReturnType<SttImpl>>> {
  const owner = ownerUserId();
  const seconds = opts.seconds && opts.seconds > 0 ? Math.ceil(opts.seconds) : await audioSeconds(mp3Path);
  await assertDailySttBudget(seconds);
  try {
    const result = await withDeadline(
      () => impl(mp3Path),
      sttOperationTimeoutMs(),
      () => new AiTimeoutError("Расшифровка заняла слишком много времени."),
    );
    await recordCall({
      kind: STT_CALL_KIND,
      owner,
      reelId: opts.reelId,
      model: result.model ?? STT_MODEL,
      status: "done",
      promptTokens: seconds,
      completionTokens: 0,
      snapshot: { gateway: true, seconds },
    }).catch(() => undefined);
    return result;
  } catch (error) {
    await recordCall({
      kind: STT_CALL_KIND,
      owner,
      reelId: opts.reelId,
      model: STT_MODEL,
      status: "error",
      promptTokens: seconds,
      completionTokens: 0,
      errorMessage: error instanceof Error ? error.name : "error",
      snapshot: { gateway: true, seconds },
    }).catch(() => undefined);
    throw error;
  }
}

function isUniqueConflict(error: unknown) {
  return (error as { code?: string } | null)?.code === "P2002";
}

export type VoiceErrorFactory = (message: string, code: string) => Error;

/**
 * Voice answer → text, once per idempotency key. A replay with the same key returns the stored
 * transcript without ffmpeg or STT. The stored row doubles as the STT accounting row.
 */
export function transcribeVoiceOnce(input: {
  scope: string;
  reelId?: string | null;
  idempotencyKey: string;
  file: File;
  transcribe?: SttImpl;
  extract?: typeof extractAudio;
  makeError: VoiceErrorFactory;
}): Promise<string> {
  const key = input.idempotencyKey.trim();
  if (!key) return transcribeVoiceOnceUnkeyed(input);
  return withAiInflight(`stt:${ownerUserId()}:${input.scope}:${key}`, () => transcribeVoiceOnceUnkeyed(input));
}

async function transcribeVoiceOnceUnkeyed(input: {
  scope: string;
  reelId?: string | null;
  idempotencyKey: string;
  file: File;
  transcribe?: SttImpl;
  extract?: typeof extractAudio;
  makeError: VoiceErrorFactory;
}): Promise<string> {
  const owner = ownerUserId();
  const key = input.idempotencyKey.trim();
  const turnKey = `stt:${owner}:${input.scope}:${key}`;
  if (key) {
    const stored = await prisma.aiCall.findUnique({ where: { turnKey } });
    if (stored && stored.status === "done" && stored.responseText !== null) return stored.responseText;
  }
  if (!input.file.size) throw input.makeError("Голосовой файл пуст. Запишите голос заново.", "VOICE_EMPTY");
  if (input.file.size > maxVoiceBytes()) {
    throw input.makeError("Голосовой файл слишком большой. Запишите короче.", "VOICE_TOO_LARGE");
  }
  const extract = input.extract ?? extractAudio;
  const transcribe = input.transcribe ?? transcribeAudio;
  const dir = await mkdtemp(path.join(tmpdir(), "vocal-voice-"));
  const rawPath = path.join(dir, "reply.webm");
  const mp3Path = path.join(dir, "reply.mp3");
  try {
    await writeFile(rawPath, Buffer.from(await input.file.arrayBuffer()));
    try {
      await extract(rawPath, mp3Path);
    } catch {
      throw input.makeError("Не удалось подготовить голосовой ответ. Запишите голос заново.", "STT_PREPARE");
    }
    const seconds = await audioSeconds(mp3Path, input.file.size);
    if (seconds > maxVoiceSeconds() + 1) {
      throw input.makeError("Голосовой ответ длиннее трёх минут. Запишите короче.", "VOICE_TOO_LONG");
    }
    let text: string;
    try {
      const stt = await meteredTranscribe(mp3Path, transcribe, { seconds, reelId: input.reelId });
      text = stt.text.trim();
    } catch (error) {
      if (error instanceof AiBudgetError) throw error;
      throw input.makeError("Не удалось расшифровать голос. Повторите отправку или запишите заново.", "STT_FAILED");
    }
    if (key) {
      // meteredTranscribe already wrote the accounting row; bind the transcript to the key so a
      // replay is free. Attach to that row's twin lookup via a dedicated keyed row (no tokens).
      try {
        await recordCall({
          kind: "stt_voice_key",
          owner,
          reelId: input.reelId,
          model: STT_MODEL,
          status: "done",
          promptTokens: 0,
          completionTokens: 0,
          turnKey,
          responseText: text,
          snapshot: { gateway: true, scope: input.scope },
        });
      } catch (error) {
        if (!isUniqueConflict(error)) throw error;
      }
    }
    return text;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

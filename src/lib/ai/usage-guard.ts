import { prisma } from "@/lib/db";
import { ownerUserId } from "@/lib/auth/session";

const inflight = new Map<string, Promise<unknown>>();

export class AiBudgetError extends Error {
  readonly code = "AI_BUDGET";
  readonly status = 429;
  constructor(message = "Дневной лимит обращений к модели исчерпан.") {
    super(message);
    this.name = "AiBudgetError";
  }
}

export class AiInflightError extends Error {
  readonly code = "AI_INFLIGHT";
  readonly status = 409;
  constructor(message = "Этот запрос к модели уже выполняется.") {
    super(message);
    this.name = "AiInflightError";
  }
}

export class StateVersionError extends Error {
  readonly code = "STATE_VERSION";
  readonly status = 409;
  constructor(message = "Состояние мысли уже изменилось. Обновите и повторите.") {
    super(message);
    this.name = "StateVersionError";
  }
}

export type AiOperationKeyInput = {
  ownerUserId: string;
  objectType: string;
  objectId: string;
  operationType: string;
  idempotencyKey: string;
};

export function aiOperationKey(input: AiOperationKeyInput): string {
  return [
    input.ownerUserId,
    input.objectType,
    input.objectId,
    input.operationType,
    input.idempotencyKey,
  ].join(":");
}

export const STT_CALL_KIND = "stt";
export const DEFAULT_DAILY_TOKEN_LIMIT = 200_000;
export const DEFAULT_DAILY_STT_SECONDS = 3600;

/** Unset or invalid → default. Explicit `0` disables the limit (local/dev only). */
function limitFromEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return fallback;
  return Math.floor(value);
}

export function dailyTokenLimit(): number {
  return limitFromEnv("VOCAL_DAILY_TOKEN_LIMIT", DEFAULT_DAILY_TOKEN_LIMIT);
}

export function dailySttSecondsLimit(): number {
  return limitFromEnv("VOCAL_DAILY_STT_SECONDS", DEFAULT_DAILY_STT_SECONDS);
}

function dayStart(): Date {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start;
}

/** Chat tokens spent today by the current owner. STT rows keep audio seconds in promptTokens and are excluded. */
export async function chatTokensUsedToday(owner = ownerUserId()): Promise<number> {
  const rows = await prisma.aiCall.aggregate({
    where: {
      kind: { not: STT_CALL_KIND },
      status: { in: ["done", "error"] },
      createdAt: { gte: dayStart() },
      ownerUserId: owner,
    },
    _sum: { promptTokens: true, completionTokens: true },
  });
  return (rows._sum.promptTokens ?? 0) + (rows._sum.completionTokens ?? 0);
}

/** Audio seconds sent to STT today by the current owner (stored in promptTokens of kind "stt"). */
export async function sttSecondsUsedToday(owner = ownerUserId()): Promise<number> {
  const rows = await prisma.aiCall.aggregate({
    where: { kind: STT_CALL_KIND, createdAt: { gte: dayStart() }, ownerUserId: owner },
    _sum: { promptTokens: true },
  });
  return rows._sum.promptTokens ?? 0;
}

export async function assertDailyTokenBudget(): Promise<void> {
  const limit = dailyTokenLimit();
  if (limit <= 0) return;
  if ((await chatTokensUsedToday()) >= limit) throw new AiBudgetError();
}

export async function assertDailySttBudget(seconds: number): Promise<void> {
  const limit = dailySttSecondsLimit();
  if (limit <= 0) return;
  if ((await sttSecondsUsedToday()) + Math.max(0, seconds) > limit) {
    throw new AiBudgetError("Дневной лимит расшифровки голоса исчерпан.");
  }
}

export function withAiInflight<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const pending = run().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, pending);
  return pending;
}

export function resetAiInflightForTests() {
  inflight.clear();
}

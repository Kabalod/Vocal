import { prisma } from "@/lib/db";
import { ownerUserId } from "@/lib/auth/session";
import { isOrdinaryUser, quotaEnforced } from "@/lib/quota-env";

const inflight = new Map<string, Promise<unknown>>();

export class AiBudgetError extends Error {
  readonly code: string = "AI_BUDGET";
  readonly status: number = 429;
  constructor(message = "Дневной лимит обращений к модели исчерпан.") {
    super(message);
    this.name = "AiBudgetError";
  }
}

/** J1: too many requests per minute from one author. */
export class RateLimitedError extends AiBudgetError {
  override readonly code: string = "RATE_LIMITED";
  override readonly status: number = 429;
  constructor(readonly retryAfterSeconds: number) {
    super("Слишком много запросов. Подождите минуту и повторите.");
    this.name = "RateLimitedError";
  }
}

/** J1: the global switch: the day's provider spend passed the cap. */
export class AiPausedError extends AiBudgetError {
  override readonly code: string = "AI_PAUSED";
  override readonly status: number = 503;
  constructor() {
    super("Сервис временно приостановлен: суточный расход на модель исчерпан. Попробуйте позже.");
    this.name = "AiPausedError";
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

export const DEFAULT_GLOBAL_DAILY_TOKEN_CAP = 20_000_000;

export function globalDailyTokenCap(env: Record<string, string | undefined> = process.env): number {
  const raw = env.VOCAL_GLOBAL_DAILY_TOKEN_CAP?.trim();
  if (!raw) return DEFAULT_GLOBAL_DAILY_TOKEN_CAP;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : DEFAULT_GLOBAL_DAILY_TOKEN_CAP;
}

/** J1 global switch: chat tokens of ALL users since midnight against VOCAL_GLOBAL_DAILY_TOKEN_CAP (0 disables). Only where the quota is enforced. */
export async function assertGlobalSpendCap(): Promise<void> {
  const cap = globalDailyTokenCap();
  if (cap <= 0 || !quotaEnforced()) return;
  const rows = await prisma.aiCall.aggregate({
    where: { kind: { not: STT_CALL_KIND }, status: { in: ["done", "error"] }, createdAt: { gte: dayStart() } },
    _sum: { promptTokens: true, completionTokens: true },
  });
  if ((rows._sum.promptTokens ?? 0) + (rows._sum.completionTokens ?? 0) >= cap) throw new AiPausedError();
}

export async function assertDailyTokenBudget(): Promise<void> {
  await assertGlobalSpendCap();
  // J1: the per-user daily token limit is for the owner/dev contour only; ordinary authors have the thought quota,
  // the per-thought ceiling, the request rate limit and the global switch instead.
  if (isOrdinaryUser()) return;
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

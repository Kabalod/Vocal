/**
 * J1: the thought quota per paid period, and the protections that replace the daily token quota for ordinary users.
 *
 *  - A period is [periodStart, periodEnd), tied to the payment date. The row lives in UserQuota (one per auth user).
 *  - A thought is spent when it is created (inside the creating transaction, with the first take). Dialogue, scripts, edits and
 *    repeated generations inside an existing thought never spend the quota; a replay of the same creation key never spends it twice.
 *  - No row, an expired period or thoughtsUsed >= thoughtsLimit: creating a thought answers 402 QUOTA_EXHAUSTED. Existing thoughts stay
 *    available for reading, copying and downloading.
 *  - Per thought: at most 8 questions and about 40k tokens of dialogue; after that the author offers "Сгенерировать сценарий".
 *  - Per user: a request rate limit per minute. Globally: a switch when the day's provider spend passes a cap.
 *  - Enforcement is on in production and in tests that set VOCAL_QUOTA=on; it is off in the local dev/test contour (VOCAL_QUOTA=off
 *    forces it off). Owners listed in VOCAL_OWNER_USER_IDS are exempt and keep the daily token limit of the owner/dev contour.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ownerUserId } from "@/lib/auth/session";
import { RateLimitedError } from "@/lib/ai/usage-guard";
import { isOrdinaryUser, isOwnerUser, quotaEnforced } from "@/lib/quota-env";

export { isOrdinaryUser, isOwnerUser, quotaEnforced };

export const DEFAULT_THOUGHTS_LIMIT = 100;
export const DEFAULT_PERIOD_DAYS = 30;
export const THOUGHT_QUESTION_CEILING = 8;
export const THOUGHT_TOKEN_CEILING = 40_000;
export const DEFAULT_REQUESTS_PER_MINUTE = 30;

export class QuotaExhaustedError extends Error {
  readonly code = "QUOTA_EXHAUSTED";
  readonly status = 402;
  constructor(readonly periodEnd: Date | null) {
    super("Лимит мыслей на оплаченный период исчерпан. Продлите тариф, чтобы создавать новые мысли.");
    this.name = "QuotaExhaustedError";
  }
}

export type QuotaStatus = {
  enforced: boolean;
  exempt: boolean;
  hasPeriod: boolean;
  periodStart: string | null;
  periodEnd: string | null;
  thoughtsLimit: number;
  thoughtsUsed: number;
  remaining: number;
  /** Creating a thought is allowed now. */
  canCreate: boolean;
};

export async function getQuotaStatus(userId = ownerUserId(), now = new Date()): Promise<QuotaStatus> {
  const enforced = quotaEnforced();
  const exempt = !enforced || isOwnerUser(userId);
  const row = await prisma.userQuota.findUnique({ where: { ownerUserId: userId } });
  const active = Boolean(row) && now >= row!.periodStart && now < row!.periodEnd;
  const limit = row?.thoughtsLimit ?? DEFAULT_THOUGHTS_LIMIT;
  const used = row?.thoughtsUsed ?? 0;
  const remaining = active ? Math.max(0, limit - used) : 0;
  return {
    enforced,
    exempt,
    hasPeriod: Boolean(row),
    periodStart: row?.periodStart.toISOString() ?? null,
    periodEnd: row?.periodEnd.toISOString() ?? null,
    thoughtsLimit: limit,
    thoughtsUsed: used,
    remaining,
    canCreate: exempt || remaining > 0,
  };
}

/**
 * Spends one thought. Call it inside the transaction that creates the reel, only when a NEW reel is created (never on a replay of
 * an existing creation key). The row is locked, so two parallel creations cannot both take the last slot.
 */
export async function consumeThoughtSlot(tx: Prisma.TransactionClient, userId = ownerUserId(), now = new Date()): Promise<void> {
  if (!quotaEnforced() || isOwnerUser(userId)) return;
  const rows = await tx.$queryRaw<{ periodStart: Date; periodEnd: Date; thoughtsLimit: number; thoughtsUsed: number }[]>`
    SELECT "periodStart", "periodEnd", "thoughtsLimit", "thoughtsUsed" FROM "UserQuota" WHERE "ownerUserId" = ${userId} FOR UPDATE`;
  const row = rows[0];
  if (!row || now < row.periodStart || now >= row.periodEnd || row.thoughtsUsed >= row.thoughtsLimit) {
    throw new QuotaExhaustedError(row?.periodEnd ?? null);
  }
  await tx.userQuota.update({ where: { ownerUserId: userId }, data: { thoughtsUsed: { increment: 1 } } });
}

/**
 * Payment stub: renewal resets thoughtsUsed and starts a new period at the payment date. Real payments are not connected;
 * the only callers are this function and the dev-only endpoint.
 */
export async function renewPeriod(
  userId: string,
  options: { now?: Date; days?: number; limit?: number } = {},
): Promise<QuotaStatus> {
  const start = options.now ?? new Date();
  const days = options.days ?? DEFAULT_PERIOD_DAYS;
  const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
  await prisma.userQuota.upsert({
    where: { ownerUserId: userId },
    create: { ownerUserId: userId, periodStart: start, periodEnd: end, thoughtsLimit: options.limit ?? DEFAULT_THOUGHTS_LIMIT, thoughtsUsed: 0 },
    update: { periodStart: start, periodEnd: end, thoughtsUsed: 0, ...(options.limit !== undefined ? { thoughtsLimit: options.limit } : {}) },
  });
  return getQuotaStatus(userId, start);
}

// ---- abuse protections ------------------------------------------------------------------------------------------------

/** Per-user sliding window, one app instance (S0.1). */
const requestLog = new Map<string, number[]>();

export function requestsPerMinute(env: Record<string, string | undefined> = process.env): number {
  const value = Number(env.VOCAL_RATE_PER_MINUTE);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_REQUESTS_PER_MINUTE;
}

export function checkRequestRate(userId = ownerUserId(), now = Date.now()): void {
  if (!isOrdinaryUser(userId)) return;
  const windowStart = now - 60_000;
  const recent = (requestLog.get(userId) ?? []).filter((at) => at > windowStart);
  if (recent.length >= requestsPerMinute()) {
    requestLog.set(userId, recent);
    throw new RateLimitedError(Math.max(1, Math.ceil((recent[0] + 60_000 - now) / 1000)));
  }
  recent.push(now);
  requestLog.set(userId, recent);
}

export function resetRequestRateForTests() {
  requestLog.clear();
}

// ---- per-thought ceiling -----------------------------------------------------------------------------------------------

export function thoughtQuestionCeiling(env: Record<string, string | undefined> = process.env): number {
  const value = Number(env.VOCAL_THOUGHT_QUESTION_CEILING);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : THOUGHT_QUESTION_CEILING;
}

export function thoughtTokenCeiling(env: Record<string, string | undefined> = process.env): number {
  const value = Number(env.VOCAL_THOUGHT_TOKEN_CEILING);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : THOUGHT_TOKEN_CEILING;
}

/** 8 questions or about 40k tokens of dialogue spent on this thought (scripts and speech recognition are not counted). */
export async function thoughtCeilingReached(reelId: string, threadId: string, userId = ownerUserId()): Promise<boolean> {
  if (!isOrdinaryUser(userId)) return false;
  const questions = await prisma.dialogueMessage.count({ where: { threadId, role: "assistant", kind: "question", status: "done" } });
  if (questions >= thoughtQuestionCeiling()) return true;
  const tokens = await prisma.aiCall.aggregate({
    where: { reelId, kind: { notIn: ["stt", "script"] }, status: { in: ["done", "error"] } },
    _sum: { promptTokens: true, completionTokens: true },
  });
  return (tokens._sum.promptTokens ?? 0) + (tokens._sum.completionTokens ?? 0) >= thoughtTokenCeiling();
}

/** What the author sees after the ceiling: the model is not called. */
export const CEILING_REPLY = "По этой мысли мы набрали достаточно вопросов. Можно сгенерировать сценарий. Собрать его сейчас?";

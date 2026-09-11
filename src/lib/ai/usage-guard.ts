import { prisma } from "@/lib/db";

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

export function dailyTokenLimit(): number {
  const raw = Number(process.env.VOCAL_DAILY_TOKEN_LIMIT ?? 0);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
}

export async function assertDailyTokenBudget(): Promise<void> {
  const limit = dailyTokenLimit();
  if (limit <= 0) return;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const rows = await prisma.aiCall.aggregate({
    where: { status: "done", createdAt: { gte: start } },
    _sum: { promptTokens: true, completionTokens: true },
  });
  const used = (rows._sum.promptTokens ?? 0) + (rows._sum.completionTokens ?? 0);
  if (used >= limit) throw new AiBudgetError();
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

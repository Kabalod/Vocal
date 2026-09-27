import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const AI_DAILY_CALL_LIMIT_ENV = "VOCAL_AI_DAILY_CALL_LIMIT";
export const AI_BUDGET_FILE_ENV = "VOCAL_AI_BUDGET_FILE";
export const DEFAULT_AI_DAILY_CALL_LIMIT = 50;

export class AiCallBudgetError extends Error {
  constructor(
    message: string,
    readonly code = "AI_CALL_BUDGET",
  ) {
    super(message);
    this.name = "AiCallBudgetError";
  }
}

/** Test-only. Production keeps defaults. */
export const aiCallBudgetSeam = {
  filePath: null as string | null,
  today: null as string | null,
};

export function aiDailyCallLimit() {
  const raw = process.env[AI_DAILY_CALL_LIMIT_ENV]?.trim();
  if (!raw) return DEFAULT_AI_DAILY_CALL_LIMIT;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return DEFAULT_AI_DAILY_CALL_LIMIT;
  return Math.floor(value);
}

export function aiBudgetFilePath() {
  return aiCallBudgetSeam.filePath ?? process.env[AI_BUDGET_FILE_ENV]?.trim() ?? join(process.cwd(), ".vocal-ai-call-budget.json");
}

function todayKey() {
  return aiCallBudgetSeam.today ?? new Date().toLocaleDateString("en-CA");
}

function readState(): { date: string; count: number } {
  try {
    const raw = JSON.parse(readFileSync(aiBudgetFilePath(), "utf8")) as { date?: string; count?: number };
    const date = typeof raw.date === "string" ? raw.date : "";
    const count = Number(raw.count);
    if (!date || !Number.isFinite(count) || count < 0) return { date: todayKey(), count: 0 };
    return { date, count: Math.floor(count) };
  } catch {
    return { date: todayKey(), count: 0 };
  }
}

function writeState(state: { date: string; count: number }) {
  const file = aiBudgetFilePath();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(state)}\n`, "utf8");
}

export function peekAiCallBudget() {
  const today = todayKey();
  const state = readState();
  const count = state.date === today ? state.count : 0;
  return { date: today, count, limit: aiDailyCallLimit(), remaining: Math.max(0, aiDailyCallLimit() - count) };
}

/** Counts one outbound model call. Failed calls still consume the daily reserve. */
export function consumeAiCallBudget(label = "request") {
  const today = todayKey();
  const limit = aiDailyCallLimit();
  const state = readState();
  const count = state.date === today ? state.count : 0;
  if (count >= limit) {
    throw new AiCallBudgetError(
      `Дневной лимит вызовов модели исчерпан (${count}/${limit}, ${label}).`,
    );
  }
  writeState({ date: today, count: count + 1 });
  return { date: today, count: count + 1, limit, remaining: Math.max(0, limit - count - 1) };
}

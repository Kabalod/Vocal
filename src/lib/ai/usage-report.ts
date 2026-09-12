import { prisma } from "@/lib/db";
import { dailyTokenLimit } from "@/lib/ai/usage-guard";

export type AiUsageContextType = "reel" | "profile" | "none";

export type AiUsageRow = {
  day: string;
  contextType: AiUsageContextType;
  contextId: string | null;
  kind: string;
  model: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type AiUsageReport = {
  generatedAt: string;
  dailyLimit: number;
  usedToday: number;
  rows: AiUsageRow[];
};

function dayKey(date: Date): string {
  const local = new Date(date);
  const year = local.getFullYear();
  const month = String(local.getMonth() + 1).padStart(2, "0");
  const day = String(local.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function contextOf(row: { reelId: string | null; profileId: string | null }): {
  contextType: AiUsageContextType;
  contextId: string | null;
} {
  if (row.profileId) return { contextType: "profile", contextId: row.profileId };
  if (row.reelId) return { contextType: "reel", contextId: row.reelId };
  return { contextType: "none", contextId: null };
}

export async function buildAiUsageReport(): Promise<AiUsageReport> {
  const calls = await prisma.aiCall.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      kind: true,
      model: true,
      reelId: true,
      profileId: true,
      promptTokens: true,
      completionTokens: true,
      createdAt: true,
      status: true,
    },
  });
  const grouped = new Map<string, AiUsageRow>();
  for (const call of calls) {
    const { contextType, contextId } = contextOf(call);
    const key = [dayKey(call.createdAt), contextType, contextId ?? "", call.kind, call.model].join("|");
    const promptTokens = call.promptTokens ?? 0;
    const completionTokens = call.completionTokens ?? 0;
    const existing = grouped.get(key);
    if (existing) {
      existing.calls += 1;
      existing.promptTokens += promptTokens;
      existing.completionTokens += completionTokens;
      existing.totalTokens += promptTokens + completionTokens;
    } else {
      grouped.set(key, {
        day: dayKey(call.createdAt),
        contextType,
        contextId,
        kind: call.kind,
        model: call.model,
        calls: 1,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      });
    }
  }
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const usedToday = calls
    .filter((call) => call.status === "done" && call.createdAt >= start)
    .reduce((sum, call) => sum + (call.promptTokens ?? 0) + (call.completionTokens ?? 0), 0);
  return {
    generatedAt: new Date().toISOString(),
    dailyLimit: dailyTokenLimit(),
    usedToday,
    rows: [...grouped.values()].sort((left, right) => {
      if (left.day !== right.day) return left.day < right.day ? -1 : 1;
      if (left.contextType !== right.contextType) return left.contextType.localeCompare(right.contextType);
      return left.kind.localeCompare(right.kind);
    }),
  };
}

import { prisma } from "@/lib/db";

export type CompletionMissing = "take" | "script";

export function thoughtCompletionGate(input: {
  finalTakeId: string | null | undefined;
  finalScriptId: string | null | undefined;
  status?: string;
}) {
  const missing: CompletionMissing[] = [];
  if (!input.finalTakeId) missing.push("take");
  if (!input.finalScriptId) missing.push("script");
  const isCompleted = input.status === "completed";
  let blockedReason = "";
  if (isCompleted) {
    blockedReason = "Мысль уже завершена.";
  } else if (missing.length === 2) {
    blockedReason = "Чтобы завершить мысль, выберите итоговый дубль и итоговый сценарий.";
  } else if (missing[0] === "take") {
    blockedReason = "Не выбран итоговый дубль.";
  } else if (missing[0] === "script") {
    blockedReason = "Не выбран итоговый сценарий.";
  }
  return {
    canComplete: missing.length === 0 && !isCompleted,
    missing,
    isCompleted,
    blockedReason,
  };
}

export async function backfillFinalTakeIds(): Promise<{ hadSelected: number; copied: number }> {
  const hadSelected = await prisma.reel.count({ where: { selectedTakeId: { not: null } } });
  const copied = await prisma.$executeRaw`
    UPDATE "Reel"
    SET "finalTakeId" = "selectedTakeId"
    WHERE "selectedTakeId" IS NOT NULL
      AND "finalTakeId" IS NULL
  `;
  return { hadSelected, copied: Number(copied) };
}

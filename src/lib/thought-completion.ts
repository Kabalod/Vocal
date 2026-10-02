export type CompletionMissing = "take" | "text";

export function thoughtCompletionGate(input: {
  finalTakeId: string | null | undefined;
  finalScriptId?: string | null | undefined;
  hasFinalText?: boolean;
  status?: string;
}) {
  const missing: CompletionMissing[] = [];
  if (!input.finalTakeId) missing.push("take");
  else if (input.hasFinalText === false) missing.push("text");
  const isCompleted = input.status === "completed";
  let blockedReason = "";
  if (isCompleted) {
    blockedReason = "Мысль уже завершена.";
  } else if (missing[0] === "take") {
    blockedReason = "Не выбран итоговый дубль.";
  } else if (missing[0] === "text") {
    blockedReason = "У итогового дубля нет выбранной расшифровки.";
  }
  return {
    canComplete: missing.length === 0 && !isCompleted,
    missing,
    isCompleted,
    blockedReason,
  };
}

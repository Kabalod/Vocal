import { prisma } from "@/lib/db";
import { v03TestSeams } from "@/lib/v03-test-seams";

export class DialogueTurnExecError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 409,
  ) {
    super(message);
    this.name = "DialogueTurnExecError";
  }
}

export const DIALOGUE_EXEC_LEASE_MS = 30_000;
export const DIALOGUE_EXEC_POLL_MS = 40;
export const DIALOGUE_EXEC_WAIT_MS = 35_000;

function clock() {
  return v03TestSeams.now?.() ?? new Date();
}

function leaseMs() {
  return v03TestSeams.dialogueLeaseMs ?? DIALOGUE_EXEC_LEASE_MS;
}

export type DialogueExecClaim =
  | { claimed: true; generation: number }
  | { claimed: false; reason: "has_response" | "held" };

export async function claimDialogueModelExecution(callId: string, ownerId: string): Promise<DialogueExecClaim> {
  const now = clock();
  const until = new Date(now.getTime() + leaseMs());
  const rows = await prisma.$queryRaw<Array<{ id: string; execGeneration: number }>>`
    UPDATE "AiCall"
    SET "execOwnerId" = ${ownerId},
        "execLeaseUntil" = ${until},
        "execGeneration" = "execGeneration" + 1
    WHERE id = ${callId}
      AND "responseText" IS NULL
      AND ("execLeaseUntil" IS NULL OR "execLeaseUntil" <= ${now})
    RETURNING id, "execGeneration"
  `;
  if (rows[0]) return { claimed: true, generation: rows[0].execGeneration };
  const current = await prisma.aiCall.findUniqueOrThrow({ where: { id: callId } });
  if (current.responseText) return { claimed: false, reason: "has_response" };
  return { claimed: false, reason: "held" };
}

export async function writeDialogueModelResponse(input: {
  callId: string;
  ownerId: string;
  generation: number;
  responseText: string;
  promptTokens: number | null;
  completionTokens: number | null;
}) {
  const updated = await prisma.aiCall.updateMany({
    where: {
      id: input.callId,
      execOwnerId: input.ownerId,
      execGeneration: input.generation,
      responseText: null,
    },
    data: {
      responseText: input.responseText,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
    },
  });
  if (updated.count !== 1) {
    throw new DialogueTurnExecError("Результат хода уже записан другим исполнителем.", "TURN_FENCE");
  }
}

export async function releaseDialogueModelClaim(callId: string, ownerId: string, generation: number) {
  await prisma.aiCall.updateMany({
    where: {
      id: callId,
      execOwnerId: ownerId,
      execGeneration: generation,
      responseText: null,
    },
    data: { execOwnerId: null, execLeaseUntil: null },
  });
}

export async function waitForDialogueModelResponse(callId: string) {
  const deadline = Date.now() + DIALOGUE_EXEC_WAIT_MS;
  while (Date.now() < deadline) {
    const row = await prisma.aiCall.findUniqueOrThrow({ where: { id: callId } });
    if (row.responseText) return row;
    const leaseUntil = row.execLeaseUntil;
    if (!leaseUntil || leaseUntil.getTime() <= clock().getTime()) return row;
    await new Promise((resolve) => setTimeout(resolve, DIALOGUE_EXEC_POLL_MS));
  }
  throw new DialogueTurnExecError("Модель ещё отвечает. Повторите через несколько секунд.", "TURN_WAIT");
}

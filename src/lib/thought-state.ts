import type { Prisma, ThoughtState } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ownerUserId } from "@/lib/auth/session";
import { StateVersionError } from "@/lib/ai/usage-guard";

export class ThoughtStateError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ThoughtStateError";
  }
}

export type ThoughtStatePatch = {
  intent?: string;
  position?: string;
  takeTask?: string;
  audienceLocal?: string;
  facts?: string[];
  openGaps?: string[];
  decisions?: string[];
};

function asJsonList(value: unknown, field: string): string {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ThoughtStateError(`Поле ${field} должно быть списком строк.`, "THOUGHT_STATE_LIST");
  }
  return JSON.stringify(value);
}

export function parseThoughtStateLists(row: Pick<ThoughtState, "factsJson" | "openGapsJson" | "decisionsJson">) {
  return {
    facts: JSON.parse(row.factsJson) as string[],
    openGaps: JSON.parse(row.openGapsJson) as string[],
    decisions: JSON.parse(row.decisionsJson) as string[],
  };
}

export async function ensureThoughtState(
  tx: Prisma.TransactionClient,
  input: { reelId: string; ownerUserId: string; workingTakeId?: string | null },
): Promise<ThoughtState> {
  const existing = await tx.thoughtState.findUnique({ where: { reelId: input.reelId } });
  if (existing) return existing;
  return tx.thoughtState.create({
    data: {
      reelId: input.reelId,
      ownerUserId: input.ownerUserId,
      workingTakeId: input.workingTakeId ?? null,
    },
  });
}

export async function syncThoughtStateWorkingTake(
  tx: Prisma.TransactionClient,
  input: { reelId: string; ownerUserId: string; workingTakeId: string | null },
): Promise<void> {
  const row = await ensureThoughtState(tx, input);
  if (row.workingTakeId === input.workingTakeId) return;
  await tx.thoughtState.update({
    where: { id: row.id },
    data: {
      workingTakeId: input.workingTakeId,
      revision: { increment: 1 },
    },
  });
}

export async function getThoughtState(reelId: string) {
  const row = await prisma.thoughtState.findFirst({
    where: { reelId, ownerUserId: ownerUserId() },
  });
  if (!row) throw new ThoughtStateError("Состояние мысли не найдено.", "THOUGHT_STATE_NOT_FOUND", 404);
  return { ...row, ...parseThoughtStateLists(row) };
}

export async function applyThoughtState(input: {
  reelId: string;
  expectedRevision: number;
  patch: ThoughtStatePatch;
}): Promise<ThoughtState> {
  const owner = ownerUserId();
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ThoughtState" WHERE "reelId" = ${input.reelId} FOR UPDATE`;
    const row = await tx.thoughtState.findFirst({
      where: { reelId: input.reelId, ownerUserId: owner },
    });
    if (!row) throw new ThoughtStateError("Состояние мысли не найдено.", "THOUGHT_STATE_NOT_FOUND", 404);
    if (row.revision !== input.expectedRevision) throw new StateVersionError();

    const data: Prisma.ThoughtStateUpdateInput = { revision: { increment: 1 } };
    if (input.patch.intent !== undefined) data.intent = input.patch.intent;
    if (input.patch.position !== undefined) data.position = input.patch.position;
    if (input.patch.takeTask !== undefined) data.takeTask = input.patch.takeTask;
    if (input.patch.audienceLocal !== undefined) data.audienceLocal = input.patch.audienceLocal;
    if (input.patch.facts !== undefined) data.factsJson = asJsonList(input.patch.facts, "facts");
    if (input.patch.openGaps !== undefined) data.openGapsJson = asJsonList(input.patch.openGaps, "openGaps");
    if (input.patch.decisions !== undefined) data.decisionsJson = asJsonList(input.patch.decisions, "decisions");

    return tx.thoughtState.update({ where: { id: row.id }, data });
  });
}

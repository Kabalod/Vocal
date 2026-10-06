import type { Prisma, ThoughtState } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ownerUserId } from "@/lib/auth/session";
import { StateVersionError } from "@/lib/ai/usage-guard";
import type { AgentAction, ThoughtUpdate } from "@/lib/agent-action";
import { AgentActionError } from "@/lib/agent-action";
import { v03TestSeams } from "@/lib/v03-test-seams";

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

export const FACT_SOURCE_TYPES = ["dialogue_message", "transcript_revision", "initial_note"] as const;
export type ThoughtFactSourceType = (typeof FACT_SOURCE_TYPES)[number];

export type ThoughtFact = {
  id: string;
  text: string;
  sourceType: ThoughtFactSourceType;
  sourceId: string;
};

/**
 * Closed list of gap types shared by the dialogue and the craft cards (K0).
 * A card matches a gap by type, never by the free-form gap id.
 * The function of the ending is deliberately absent: it is a rule of the closing reply (R4), not a gap card.
 */
export const GAP_KINDS = [
  "no_episode",
  "no_thesis",
  "facts_vs_interpretation",
  "no_mechanism",
  "unclear_terms",
  "repeat_unchecked",
  "no_boundary",
  "no_audience",
  "multiple_topics",
  "promise_unclear",
] as const;
export type GapKind = (typeof GAP_KINDS)[number];

export function isGapKind(value: unknown): value is GapKind {
  return typeof value === "string" && (GAP_KINDS as readonly string[]).includes(value);
}

export type ThoughtGap = {
  id: string;
  text: string;
  status: "open" | "resolved";
  /** Optional: gaps made before K0 or by the author's correction have no type and match no card. */
  kind?: GapKind;
};

export type ThoughtStatePatch = {
  intent?: string;
  position?: string;
  takeTask?: string;
  audienceLocal?: string;
  facts?: ThoughtFact[];
  openGaps?: ThoughtGap[];
  decisions?: string[];
};

function asStringList(value: unknown, field: string): string {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ThoughtStateError(`Поле ${field} должно быть списком строк.`, "THOUGHT_STATE_LIST");
  }
  return JSON.stringify(value);
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ThoughtStateError(`Поле ${field} должно быть непустой строкой.`, "THOUGHT_STATE_SHAPE");
  }
  return value;
}

function uniqueIds(ids: string[], field: string) {
  if (new Set(ids).size !== ids.length) {
    throw new ThoughtStateError(`Поле ${field} содержит повторяющиеся id.`, "THOUGHT_STATE_ID");
  }
}

export function parseFacts(value: unknown): ThoughtFact[] {
  if (!Array.isArray(value)) {
    throw new ThoughtStateError("Поле facts должно быть списком.", "THOUGHT_STATE_SHAPE");
  }
  const facts = value.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new ThoughtStateError(`Факт ${index} должен быть объектом.`, "THOUGHT_STATE_SHAPE");
    }
    const row = item as Record<string, unknown>;
    const sourceType = requireNonEmptyString(row.sourceType, `facts[${index}].sourceType`);
    if (!FACT_SOURCE_TYPES.includes(sourceType as ThoughtFactSourceType)) {
      throw new ThoughtStateError("Тип источника факта неизвестен.", "THOUGHT_STATE_SOURCE_TYPE");
    }
    return {
      id: requireNonEmptyString(row.id, `facts[${index}].id`),
      text: requireNonEmptyString(row.text, `facts[${index}].text`),
      sourceType: sourceType as ThoughtFactSourceType,
      sourceId: requireNonEmptyString(row.sourceId, `facts[${index}].sourceId`),
    };
  });
  uniqueIds(facts.map((fact) => fact.id), "facts");
  return facts;
}

export function parseGaps(value: unknown): ThoughtGap[] {
  if (!Array.isArray(value)) {
    throw new ThoughtStateError("Поле openGaps должно быть списком.", "THOUGHT_STATE_SHAPE");
  }
  const gaps = value.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new ThoughtStateError(`Пробел ${index} должен быть объектом.`, "THOUGHT_STATE_SHAPE");
    }
    const row = item as Record<string, unknown>;
    const status = requireNonEmptyString(row.status, `openGaps[${index}].status`);
    if (status !== "open" && status !== "resolved") {
      throw new ThoughtStateError("Статус пробела должен быть open или resolved.", "THOUGHT_STATE_GAP_STATUS");
    }
    if (row.kind !== undefined && !isGapKind(row.kind)) {
      throw new ThoughtStateError("Тип пробела неизвестен.", "THOUGHT_STATE_GAP_KIND");
    }
    return {
      id: requireNonEmptyString(row.id, `openGaps[${index}].id`),
      text: requireNonEmptyString(row.text, `openGaps[${index}].text`),
      status: status as ThoughtGap["status"],
      ...(row.kind !== undefined ? { kind: row.kind } : {}),
    };
  });
  uniqueIds(gaps.map((gap) => gap.id), "openGaps");
  return gaps;
}

export function parseThoughtStateLists(row: Pick<ThoughtState, "factsJson" | "openGapsJson" | "decisionsJson">) {
  return {
    facts: parseFacts(JSON.parse(row.factsJson)),
    openGaps: parseGaps(JSON.parse(row.openGapsJson)),
    decisions: JSON.parse(row.decisionsJson) as string[],
  };
}

async function assertFactSources(
  tx: Prisma.TransactionClient,
  reelId: string,
  facts: ThoughtFact[],
) {
  for (const fact of facts) {
    if (fact.sourceType === "initial_note") {
      if (fact.sourceId !== reelId) {
        throw new ThoughtStateError("Исходная заметка должна принадлежать этой мысли.", "THOUGHT_STATE_SOURCE");
      }
      continue;
    }
    if (fact.sourceType === "transcript_revision") {
      const revision = await tx.transcriptRevision.findUnique({
        where: { id: fact.sourceId },
        select: { take: { select: { reelId: true } } },
      });
      if (!revision || revision.take.reelId !== reelId) {
        throw new ThoughtStateError("Ревизия расшифровки должна принадлежать этой мысли.", "THOUGHT_STATE_SOURCE");
      }
      continue;
    }
    const message = await tx.dialogueMessage.findUnique({
      where: { id: fact.sourceId },
      select: { role: true, thread: { select: { reelId: true } } },
    });
    if (!message || message.thread.reelId !== reelId) {
      throw new ThoughtStateError("Сообщение должно принадлежать этой мысли.", "THOUGHT_STATE_SOURCE");
    }
    if (message.role !== "user") {
      throw new ThoughtStateError("Факт мысли должен ссылаться на источник автора.", "THOUGHT_STATE_AUTHOR_SOURCE");
    }
  }
}

async function ownedThoughtState(tx: Prisma.TransactionClient, reelId: string, owner: string) {
  return tx.thoughtState.findFirst({
    where: { reelId, reel: { ownerUserId: owner } },
  });
}

export async function ensureThoughtState(
  tx: Prisma.TransactionClient,
  input: { reelId: string; ownerUserId: string; workingTakeId?: string | null },
): Promise<ThoughtState> {
  const reel = await tx.reel.findUnique({
    where: { id: input.reelId },
    select: { ownerUserId: true },
  });
  if (!reel) throw new ThoughtStateError("Карточка не найдена.", "REEL_NOT_FOUND", 404);
  if (reel.ownerUserId !== input.ownerUserId) {
    throw new ThoughtStateError("Владелец состояния должен совпадать с владельцем мысли.", "THOUGHT_STATE_OWNER");
  }
  const existing = await tx.thoughtState.findUnique({ where: { reelId: input.reelId } });
  if (existing) return existing;
  return tx.thoughtState.create({
    data: {
      reelId: input.reelId,
      ownerUserId: reel.ownerUserId,
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
    where: { reelId, reel: { ownerUserId: ownerUserId() } },
  });
  if (!row) throw new ThoughtStateError("Состояние мысли не найдено.", "THOUGHT_STATE_NOT_FOUND", 404);
  return { ...row, ...parseThoughtStateLists(row) };
}

export async function applyThoughtStateInTx(
  tx: Prisma.TransactionClient,
  input: {
    reelId: string;
    expectedRevision: number;
    patch: ThoughtStatePatch;
    ownerUserId?: string;
    turnKey?: string;
  },
): Promise<ThoughtState> {
  if (v03TestSeams.failThoughtStateApply) {
    await v03TestSeams.failThoughtStateApply({ reelId: input.reelId, turnKey: input.turnKey });
  }
  const owner = input.ownerUserId ?? ownerUserId();
  await tx.$queryRaw`SELECT id FROM "ThoughtState" WHERE "reelId" = ${input.reelId} FOR UPDATE`;
  const row = await ownedThoughtState(tx, input.reelId, owner);
  if (!row) throw new ThoughtStateError("Состояние мысли не найдено.", "THOUGHT_STATE_NOT_FOUND", 404);
  if (row.revision !== input.expectedRevision) throw new StateVersionError();

  const data: Prisma.ThoughtStateUpdateInput = { revision: { increment: 1 } };
  if (input.patch.intent !== undefined) data.intent = input.patch.intent;
  if (input.patch.position !== undefined) data.position = input.patch.position;
  if (input.patch.takeTask !== undefined) data.takeTask = input.patch.takeTask;
  if (input.patch.audienceLocal !== undefined) data.audienceLocal = input.patch.audienceLocal;
  if (input.patch.facts !== undefined) {
    const facts = parseFacts(input.patch.facts);
    await assertFactSources(tx, input.reelId, facts);
    data.factsJson = JSON.stringify(facts);
  }
  if (input.patch.openGaps !== undefined) {
    data.openGapsJson = JSON.stringify(parseGaps(input.patch.openGaps));
  }
  if (input.patch.decisions !== undefined) data.decisionsJson = asStringList(input.patch.decisions, "decisions");

  return tx.thoughtState.update({ where: { id: row.id }, data });
}

export async function applyThoughtState(input: {
  reelId: string;
  expectedRevision: number;
  patch: ThoughtStatePatch;
}): Promise<ThoughtState> {
  return prisma.$transaction((tx) => applyThoughtStateInTx(tx, input));
}

export function candidateFactId(userMessageId: string) {
  return `fact_${userMessageId}`;
}

const NON_CONTENT_EXACT = new Set(["снимай", "хватит", "уточни", "не знаю", "повтори", "повтори вопрос"]);

const NON_CONTENT_PATTERNS = [
  /^(я\s+)?не\s+знаю(\s+ответа)?$/,
  /^(я\s+)?не\s+понял(а)?(\s+вопрос)?$/,
  /^(можешь\s+|можете\s+)?повторить(\s+(вопрос|пожалуйста))?$/,
  /^повтори(\s+вопрос)?$/,
];

export function normalizeDialogueUtterance(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[?!.,…:;«»"'`]/g, "")
    .replace(/\s+/g, " ");
}

/** Short command / «не знаю» / «повтори» only. Does not classify arbitrary replies. */
export function isNonContentUtterance(text: string) {
  const normalized = normalizeDialogueUtterance(text);
  if (!normalized) return false;
  if (NON_CONTENT_EXACT.has(normalized)) return true;
  if (normalized.split(" ").length > 6) return false;
  return NON_CONTENT_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isNonFactUtterance(text: string) {
  return isNonContentUtterance(text);
}

export function buildDialogueThoughtPatch(input: {
  action: AgentAction;
  thoughtUpdate: ThoughtUpdate;
  userMessageId: string;
  userText?: string;
  facts: ThoughtFact[];
  openGaps: ThoughtGap[];
  pendingGapId: string | null;
}): ThoughtStatePatch | null {
  if (input.action.action === "redirect_to_task") {
    if (input.thoughtUpdate.fact || input.thoughtUpdate.closeGapIds.length) {
      throw new AgentActionError("redirect_to_task не меняет состояние мысли.", "ACTION_REDIRECT_STATE");
    }
    return null;
  }
  if (
    input.userText !== undefined &&
    isNonContentUtterance(input.userText) &&
    (input.thoughtUpdate.fact || input.thoughtUpdate.closeGapIds.length)
  ) {
    throw new AgentActionError("Команда или «не знаю» не становятся фактом.", "ACTION_EVIDENCE");
  }
  const patch: ThoughtStatePatch = {};
  const accepted = input.thoughtUpdate.fact;
  if (accepted) {
    if (accepted.sourceId !== input.userMessageId) {
      throw new AgentActionError("Источник факта должен быть текущим сообщением автора.", "ACTION_EVIDENCE");
    }
    if (!input.facts.some((fact) => fact.sourceType === "dialogue_message" && fact.sourceId === input.userMessageId)) {
      patch.facts = [
        ...input.facts,
        {
          id: candidateFactId(input.userMessageId),
          text: accepted.text,
          sourceType: "dialogue_message",
          sourceId: input.userMessageId,
        },
      ];
    }
  }

  if (input.thoughtUpdate.closeGapIds.length) {
    if (input.thoughtUpdate.closeGapIds.length > 1) {
      throw new AgentActionError("Одним ответом можно закрыть только один пробел.", "ACTION_GAP");
    }
    const [closeId] = input.thoughtUpdate.closeGapIds;
    const answered = input.thoughtUpdate.answeredGapId;
    if (answered && answered !== closeId) {
      throw new AgentActionError("answeredGapId должен совпадать с закрываемым пробелом.", "ACTION_GAP");
    }
    if (input.pendingGapId && closeId !== input.pendingGapId) {
      throw new AgentActionError("Закрыть можно только пробел текущего вопроса.", "ACTION_GAP");
    }
    if (input.pendingGapId && answered && answered !== input.pendingGapId) {
      throw new AgentActionError("answeredGapId не совпадает с пробелом текущего вопроса.", "ACTION_GAP");
    }
    if (!input.pendingGapId && answered !== closeId) {
      throw new AgentActionError("Закрыть можно только явно указанный пробел ответа.", "ACTION_GAP");
    }
    const open = input.openGaps.find((gap) => gap.id === closeId && gap.status === "open");
    if (!open) {
      throw new AgentActionError("Закрыть можно только открытый пробел этой мысли.", "ACTION_GAP");
    }
    patch.openGaps = input.openGaps.map((gap) =>
      gap.id === closeId ? { ...gap, status: "resolved" as const } : gap,
    );
  }

  if (input.action.action === "suggest_take") {
    patch.takeTask = input.action.takeTask;
  }

  return Object.keys(patch).length ? patch : null;
}

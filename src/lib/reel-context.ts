import {
  runtimePortraitFields,
  runtimePortraitRevisionId,
  selectedKeysForRuntime,
} from "@/lib/ai-runtime-context";
import { prisma } from "@/lib/db";
import { ownerUserId } from "@/lib/auth/session";
import { ProfileError, getProfile, parseSelectedKeys, readStoredProfilePayload } from "@/lib/profile";
import { ReelError } from "@/lib/reels";
import {
  PROFILE_FIELD_IDS,
  PROFILE_FIELD_LABELS,
  REEL_AUDIENCE_MAX,
  REEL_GOAL_MAX,
  isProfileFieldId,
  type AssembledContextField,
  type AssembledReelContext,
  type ProfileFieldId,
  type ProfileFieldValue,
  type ReelContextDto,
  type ReelContextSnapshotDto,
} from "@/types/profile";

export function assembleReelContext(input: {
  profileRevisionId: string | null;
  fields: ProfileFieldValue[];
  selectedKeys: ProfileFieldId[];
  reelGoal: string;
  reelAudience: string;
}): AssembledReelContext {
  const selected = PROFILE_FIELD_IDS.filter((id) => input.selectedKeys.includes(id));
  const selectedSet = new Set(selected);
  const byId = new Map(input.fields.map((field) => [field.id, field]));
  const publicForScript: AssembledContextField[] = [];
  const understandingOnly: AssembledContextField[] = [];

  for (const id of selected) {
    const field = byId.get(id);
    const text = field?.text.trim() ?? "";
    if (!text) continue;
    const usage = field?.usage ?? "understanding";
    const item: AssembledContextField = {
      id,
      label: PROFILE_FIELD_LABELS[id],
      text,
      usage,
    };
    if (usage === "in_text") publicForScript.push(item);
    else understandingOnly.push(item);
  }

  return {
    profileRevisionId: input.profileRevisionId,
    reelGoal: input.reelGoal.trim(),
    reelAudience: input.reelAudience.trim(),
    selectedKeys: selected,
    publicForScript,
    understandingOnly,
    excludedKeys: PROFILE_FIELD_IDS.filter((id) => !selectedSet.has(id)),
  };
}

function snapshotToDto(row: {
  id: string;
  profileRevisionId: string | null;
  reelGoal: string;
  reelAudience: string;
  selectedKeysJson: string;
  assembledJson: string;
  createdAt: Date;
}): ReelContextSnapshotDto {
  let assembled: AssembledReelContext;
  try {
    assembled = JSON.parse(row.assembledJson) as AssembledReelContext;
  } catch {
    assembled = assembleReelContext({
      profileRevisionId: row.profileRevisionId,
      fields: [],
      selectedKeys: parseSelectedKeys(row.selectedKeysJson),
      reelGoal: row.reelGoal,
      reelAudience: row.reelAudience,
    });
  }
  return {
    id: row.id,
    profileRevisionId: row.profileRevisionId,
    reelGoal: row.reelGoal,
    reelAudience: row.reelAudience,
    selectedKeys: parseSelectedKeys(row.selectedKeysJson),
    assembled,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getReelContext(reelId: string): Promise<ReelContextDto> {
  const reel = await prisma.reel.findFirst({ where: { id: reelId, ownerUserId: ownerUserId() } });
  if (!reel) throw new ReelError("Карточка не найдена.", "REEL_NOT_FOUND", 404);
  const profile = await getProfile();
  const stored = await readStoredProfilePayload();
  const fields = runtimePortraitFields(stored);
  const selectedKeys = selectedKeysForRuntime(fields, parseSelectedKeys(reel.contextKeysJson));
  const live = assembleReelContext({
    profileRevisionId: runtimePortraitRevisionId(stored, profile.currentRevisionId),
    fields,
    selectedKeys,
    reelGoal: reel.reelGoal,
    reelAudience: reel.reelAudience,
  });
  const snapshots = await prisma.reelContextSnapshot.findMany({
    where: { reelId },
    orderBy: { createdAt: "desc" },
  });
  return {
    reelId,
    reelGoal: reel.reelGoal,
    reelAudience: reel.reelAudience,
    selectedKeys,
    live,
    snapshots: snapshots.map(snapshotToDto),
  };
}

export async function saveReelContext(
  reelId: string,
  input: { reelGoal?: string; reelAudience?: string; selectedKeys?: unknown },
): Promise<ReelContextDto> {
  const reel = await prisma.reel.findFirst({ where: { id: reelId, ownerUserId: ownerUserId() } });
  if (!reel) throw new ReelError("Карточка не найдена.", "REEL_NOT_FOUND", 404);

  const reelGoal = input.reelGoal !== undefined ? input.reelGoal : reel.reelGoal;
  const reelAudience = input.reelAudience !== undefined ? input.reelAudience : reel.reelAudience;
  if (reelGoal.length > REEL_GOAL_MAX) {
    throw new ProfileError(`Цель ролика короче ${REEL_GOAL_MAX} символов.`, "GOAL_TOO_LONG");
  }
  if (reelAudience.length > REEL_AUDIENCE_MAX) {
    throw new ProfileError(`Аудитория ролика короче ${REEL_AUDIENCE_MAX} символов.`, "AUDIENCE_TOO_LONG");
  }

  let selectedKeys = parseSelectedKeys(reel.contextKeysJson);
  if (input.selectedKeys !== undefined) {
    if (!Array.isArray(input.selectedKeys)) {
      throw new ProfileError("Выбор полей контекста должен быть списком.", "CONTEXT_KEYS");
    }
    const seen = new Set<string>();
    selectedKeys = [];
    for (const item of input.selectedKeys) {
      if (typeof item !== "string" || !isProfileFieldId(item) || seen.has(item)) continue;
      seen.add(item);
      selectedKeys.push(item);
    }
  }

  const profile = await getProfile();
  const stored = await readStoredProfilePayload();
  const fields = runtimePortraitFields(stored);
  const runtimeKeys = selectedKeysForRuntime(fields, selectedKeys);
  const live = assembleReelContext({
    profileRevisionId: runtimePortraitRevisionId(stored, profile.currentRevisionId),
    fields,
    selectedKeys: runtimeKeys,
    reelGoal,
    reelAudience,
  });
  const assembledJson = JSON.stringify(live);

  await prisma.$transaction(async (tx) => {
    await tx.reel.update({
      where: { id: reelId },
      data: {
        reelGoal,
        reelAudience,
        contextKeysJson: JSON.stringify(selectedKeys),
      },
    });
    const last = await tx.reelContextSnapshot.findFirst({
      where: { reelId },
      orderBy: { createdAt: "desc" },
    });
    if (last?.assembledJson === assembledJson) return;
    await tx.reelContextSnapshot.create({
      data: {
        reelId,
        profileRevisionId: profile.currentRevisionId,
        reelGoal,
        reelAudience,
        selectedKeysJson: JSON.stringify(selectedKeys),
        assembledJson,
      },
    });
  });

  return getReelContext(reelId);
}

export async function freezeReelContext(reelId: string): Promise<ReelContextDto> {
  return saveReelContext(reelId, {});
}

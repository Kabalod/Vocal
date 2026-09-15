import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { buildPortrait, parseStoredPayload, type StoredProfilePayload } from "@/lib/profile-portrait";
import {
  LOCAL_PROFILE_ID,
  PROFILE_FIELD_IDS,
  PROFILE_FIELD_LABELS,
  PROFILE_FIELD_MAX,
  emptyProfileFields,
  isProfileFieldId,
  isProfileUsage,
  type ProfileDto,
  type ProfileFieldId,
  type ProfileFieldValue,
  type ProfileRevisionDto,
  type ProfileUsage,
} from "@/types/profile";

export class ProfileError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ProfileError";
  }
}

function normalizeFields(input: unknown): ProfileFieldValue[] {
  const byId = new Map<string, { text?: unknown; usage?: unknown }>();
  if (Array.isArray(input)) {
    for (const item of input) {
      if (!item || typeof item !== "object") continue;
      const row = item as { id?: unknown; text?: unknown; usage?: unknown };
      if (typeof row.id === "string") byId.set(row.id, row);
    }
  } else if (input && typeof input === "object") {
    for (const [id, value] of Object.entries(input as Record<string, unknown>)) {
      if (value && typeof value === "object") byId.set(id, value as { text?: unknown; usage?: unknown });
    }
  }

  return PROFILE_FIELD_IDS.map((id) => {
    const raw = byId.get(id);
    const text = typeof raw?.text === "string" ? raw.text : "";
    if (text.length > PROFILE_FIELD_MAX) {
      throw new ProfileError(`Поле «${PROFILE_FIELD_LABELS[id]}» короче ${PROFILE_FIELD_MAX} символов.`, "FIELD_TOO_LONG");
    }
    const usage: ProfileUsage =
      typeof raw?.usage === "string" && isProfileUsage(raw.usage) ? raw.usage : "understanding";
    return {
      id,
      label: PROFILE_FIELD_LABELS[id],
      text,
      usage,
    };
  });
}

function parsePayload(raw: string): ProfileFieldValue[] {
  try {
    const parsed = JSON.parse(raw) as { fields?: unknown };
    return normalizeFields(parsed.fields ?? parsed);
  } catch {
    return emptyProfileFields();
  }
}

function toRevisionDto(id: string, createdAt: Date, payloadJson: string): ProfileRevisionDto {
  return {
    id,
    createdAt: createdAt.toISOString(),
    fields: parsePayload(payloadJson),
  };
}

export async function ensureLocalProfile() {
  const existing = await prisma.creatorProfile.findUnique({ where: { id: LOCAL_PROFILE_ID } });
  if (existing) return existing;
  return prisma.creatorProfile.create({ data: { id: LOCAL_PROFILE_ID } });
}

export async function getProfile(): Promise<ProfileDto> {
  const profile = await ensureLocalProfile();
  const revisions = await prisma.profileRevision.findMany({
    where: { profileId: profile.id },
    orderBy: { createdAt: "desc" },
  });
  const current =
    revisions.find((row) => row.id === profile.currentRevisionId) ?? revisions[0] ?? null;
  return {
    id: profile.id,
    currentRevisionId: current?.id ?? null,
    fields: current ? parsePayload(current.payloadJson) : emptyProfileFields(),
    revisions: revisions.map((row) => ({ id: row.id, createdAt: row.createdAt.toISOString() })),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

export async function getProfileRevision(id: string | null | undefined): Promise<ProfileRevisionDto | null> {
  if (!id) return null;
  const row = await prisma.profileRevision.findUnique({ where: { id } });
  if (!row) return null;
  return toRevisionDto(row.id, row.createdAt, row.payloadJson);
}

export function emptyStoredPayload(): StoredProfilePayload {
  return {
    fields: emptyProfileFields(),
    skipped: false,
    supplementing: false,
    portrait: null,
    pending: null,
    dialogueSessionStartId: null,
  };
}

export function storedPayloadFromJson(payloadJson: string): StoredProfilePayload {
  const stored = parseStoredPayload(payloadJson);
  return { ...stored, fields: parsePayload(payloadJson) };
}

export function serializeStoredPayload(input: StoredProfilePayload): string {
  const fields = normalizeFields(input.fields);
  const portrait = input.portrait
    ? { ...buildPortrait(fields, input.portrait.completed), completed: input.portrait.completed }
    : null;
  return JSON.stringify({
    fields,
    skipped: input.skipped,
    supplementing: input.supplementing,
    portrait,
    pending: input.pending,
    dialogueSessionStartId: input.dialogueSessionStartId,
  });
}

export async function readStoredProfilePayloadTx(
  tx: Prisma.TransactionClient,
): Promise<{ stored: StoredProfilePayload; revisionId: string | null }> {
  const profile = await tx.creatorProfile.findUnique({ where: { id: LOCAL_PROFILE_ID } });
  if (!profile?.currentRevisionId) {
    return { stored: emptyStoredPayload(), revisionId: null };
  }
  const current = await tx.profileRevision.findUnique({ where: { id: profile.currentRevisionId } });
  if (!current) {
    return { stored: emptyStoredPayload(), revisionId: null };
  }
  return { stored: storedPayloadFromJson(current.payloadJson), revisionId: current.id };
}

export async function readStoredProfilePayload(): Promise<StoredProfilePayload> {
  await ensureLocalProfile();
  const { stored } = await readStoredProfilePayloadTx(prisma);
  return stored;
}

export async function persistProfilePayloadTx(
  tx: Prisma.TransactionClient,
  input: StoredProfilePayload,
): Promise<string> {
  const revision = await tx.profileRevision.create({
    data: {
      profileId: LOCAL_PROFILE_ID,
      payloadJson: serializeStoredPayload(input),
    },
  });
  await tx.creatorProfile.update({
    where: { id: LOCAL_PROFILE_ID },
    data: { currentRevisionId: revision.id },
  });
  return revision.id;
}

export async function persistProfilePayload(input: StoredProfilePayload): Promise<ProfileDto> {
  await ensureLocalProfile();
  await prisma.$transaction(async (tx) => persistProfilePayloadTx(tx, input));
  return getProfile();
}

export async function saveProfile(input: { fields: unknown }): Promise<ProfileDto> {
  const fields = normalizeFields(input.fields);
  const current = await readStoredProfilePayload();
  return persistProfilePayload({
    ...current,
    fields,
    portrait: current.portrait ? buildPortrait(fields, current.portrait.completed) : null,
  });
}

export function parseSelectedKeys(raw: string | null | undefined): ProfileFieldId[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const keys: ProfileFieldId[] = [];
    for (const item of parsed) {
      if (typeof item !== "string" || !isProfileFieldId(item) || seen.has(item)) continue;
      seen.add(item);
      keys.push(item);
    }
    return keys;
  } catch {
    return [];
  }
}

export { parsePayload as parseProfilePayload };

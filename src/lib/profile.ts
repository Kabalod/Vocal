import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { portraitProfileId } from "@/lib/auth/session";
import { buildPortrait, emptyStoredPayload, parsePending, parseStoredPayload, type StoredProfilePayload } from "@/lib/profile-portrait";
import { beforeSessionLockForTests } from "@/lib/profile-lock-seam";
import { displayedProfileFields } from "@/lib/v04-slice";
import {
  PROFILE_FIELD_IDS,
  PROFILE_FIELD_LABELS,
  PROFILE_FIELD_MAX,
  emptyProfileFields,
  isProfileFieldId,
  isProfileUsage,
  type ProfileDto,
  type ProfileFieldId,
  type ProfileFieldValue,
  type ProfilePendingChange,
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
    fields: displayedProfileFields(parseStoredPayload(payloadJson)),
  };
}

export async function ensureLocalProfile() {
  const id = portraitProfileId();
  const existing = await prisma.creatorProfile.findUnique({ where: { id } });
  if (existing) return existing;
  return prisma.creatorProfile.create({ data: { id, ownerUserId: id } });
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
    fields: current ? displayedProfileFields(parseStoredPayload(current.payloadJson)) : emptyProfileFields(),
    revisions: revisions.map((row) => ({ id: row.id, createdAt: row.createdAt.toISOString() })),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

export async function getProfileRevision(id: string | null | undefined): Promise<ProfileRevisionDto | null> {
  if (!id) return null;
  const row = await prisma.profileRevision.findFirst({
    where: { id, profileId: portraitProfileId() },
  });
  if (!row) return null;
  return toRevisionDto(row.id, row.createdAt, row.payloadJson);
}

export { emptyStoredPayload };

export function storedPayloadFromJson(payloadJson: string): StoredProfilePayload {
  const stored = parseStoredPayload(payloadJson);
  return { ...stored, fields: displayedProfileFields(stored) };
}

export type ProfileSessionState = {
  skipped: boolean;
  supplementing: boolean;
  dialogueSessionStartId: string | null;
  pending: ProfilePendingChange | null;
};

export function parseProfileSessionJson(raw: string | null | undefined): ProfileSessionState | null {
  if (!raw?.trim() || raw.trim() === "{}") return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    if (
      !("skipped" in parsed) &&
      !("supplementing" in parsed) &&
      !("dialogueSessionStartId" in parsed) &&
      !("pending" in parsed)
    ) {
      return null;
    }
    return {
      skipped: parsed.skipped === true,
      supplementing: parsed.supplementing === true,
      dialogueSessionStartId:
        typeof parsed.dialogueSessionStartId === "string" && parsed.dialogueSessionStartId.trim()
          ? parsed.dialogueSessionStartId
          : null,
      pending: parsePending(parsed.pending),
    };
  } catch {
    return null;
  }
}

export function serializeProfileSessionJson(session: ProfileSessionState): string {
  return JSON.stringify({
    skipped: session.skipped,
    supplementing: session.supplementing,
    dialogueSessionStartId: session.dialogueSessionStartId,
    pending: session.pending,
  });
}

export function overlayProfileSession(
  portrait: StoredProfilePayload,
  sessionJson: string | null | undefined,
): StoredProfilePayload {
  const session = parseProfileSessionJson(sessionJson);
  if (!session) return portrait;
  return { ...portrait, ...session };
}

export function sessionStateFromStored(stored: StoredProfilePayload): ProfileSessionState {
  return {
    skipped: stored.skipped,
    supplementing: stored.supplementing,
    dialogueSessionStartId: stored.dialogueSessionStartId,
    pending: stored.pending,
  };
}

export function serializeStoredPayload(input: StoredProfilePayload): string {
  const fields = displayedProfileFields({ ...input, fields: normalizeFields(input.fields) });
  const portrait = input.portrait
    ? { ...buildPortrait(fields, input.portrait.completed), completed: input.portrait.completed }
    : null;
  return JSON.stringify({
    fields,
    portrait,
    v04Slice: input.v04Slice ?? {},
  });
}

export async function readStoredProfilePayloadTx(
  tx: Prisma.TransactionClient,
): Promise<{ stored: StoredProfilePayload; revisionId: string | null }> {
  const profile = await tx.creatorProfile.findUnique({ where: { id: portraitProfileId() } });
  if (!profile) {
    return { stored: emptyStoredPayload(), revisionId: null };
  }
  if (!profile.currentRevisionId) {
    return { stored: overlayProfileSession(emptyStoredPayload(), profile.sessionJson), revisionId: null };
  }
  const current = await tx.profileRevision.findUnique({ where: { id: profile.currentRevisionId } });
  if (!current) {
    return { stored: overlayProfileSession(emptyStoredPayload(), profile.sessionJson), revisionId: null };
  }
  return {
    stored: overlayProfileSession(storedPayloadFromJson(current.payloadJson), profile.sessionJson),
    revisionId: current.id,
  };
}

export async function readStoredProfilePayload(): Promise<StoredProfilePayload> {
  await ensureLocalProfile();
  const { stored } = await readStoredProfilePayloadTx(prisma);
  return stored;
}

function displayedPortraitSignature(stored: StoredProfilePayload): string {
  return JSON.stringify({
    slice: stored.v04Slice ?? {},
    completed: stored.portrait?.completed === true,
    fields: displayedProfileFields(stored).map((field) => ({ id: field.id, text: field.text, usage: field.usage })),
  });
}

export type ProfileSessionPatch = {
  skipped?: boolean;
  supplementing?: boolean;
  dialogueSessionStartId?: string | null;
  pending?: ProfilePendingChange | null;
};

async function lockLocalProfileTx(tx: Prisma.TransactionClient) {
  const profileId = portraitProfileId();
  await tx.$queryRaw`SELECT id FROM "CreatorProfile" WHERE id = ${profileId} FOR UPDATE`;
}

async function writeSessionTx(tx: Prisma.TransactionClient, session: ProfileSessionState) {
  await tx.creatorProfile.update({
    where: { id: portraitProfileId() },
    data: { sessionJson: serializeProfileSessionJson(session) },
  });
}

export async function persistProfilePayloadTx(
  tx: Prisma.TransactionClient,
  input: StoredProfilePayload,
): Promise<string | null> {
  const profileId = portraitProfileId();
  await lockLocalProfileTx(tx);
  const { stored: latest, revisionId } = await readStoredProfilePayloadTx(tx);
  await writeSessionTx(tx, sessionStateFromStored(input));
  if (displayedPortraitSignature(latest) === displayedPortraitSignature(input)) {
    return revisionId;
  }
  const revision = await tx.profileRevision.create({
    data: {
      profileId,
      payloadJson: serializeStoredPayload(input),
    },
  });
  await tx.creatorProfile.update({
    where: { id: profileId },
    data: { currentRevisionId: revision.id },
  });
  return revision.id;
}

export async function persistProfilePayload(input: StoredProfilePayload): Promise<ProfileDto> {
  await ensureLocalProfile();
  await prisma.$transaction(async (tx) => persistProfilePayloadTx(tx, input));
  return getProfile();
}

export async function persistProfileSession(patch: ProfileSessionPatch): Promise<ProfileDto> {
  await ensureLocalProfile();
  await prisma.$transaction(async (tx) => {
    await beforeSessionLockForTests();
    await lockLocalProfileTx(tx);
    const { stored: latest } = await readStoredProfilePayloadTx(tx);
    await writeSessionTx(tx, {
      skipped: patch.skipped ?? latest.skipped,
      supplementing: patch.supplementing ?? latest.supplementing,
      dialogueSessionStartId:
        patch.dialogueSessionStartId !== undefined ? patch.dialogueSessionStartId : latest.dialogueSessionStartId,
      pending: patch.pending !== undefined ? patch.pending : latest.pending,
    });
  });
  return getProfile();
}

export async function saveProfile(_input: { fields: unknown }): Promise<ProfileDto> {
  throw new ProfileError(
    "Прямое сохранение анкеты больше не используется. Портрет меняется только из диалога профиля.",
    "SAVE_PROFILE_REMOVED",
    410,
  );
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

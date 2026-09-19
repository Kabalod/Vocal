import type { Prisma, PrismaClient } from "@prisma/client";

export const VOCAL_MODEL_INVENTORY = [
  "criterion",
  "creatorProfile",
  "profileRevision",
  "reel",
  "thoughtCreateKey",
  "reelContextSnapshot",
  "scriptVersion",
  "take",
  "transcriptRevision",
  "job",
  "analysisResult",
  "aiCall",
  "review",
  "question",
  "answer",
  "scriptDraft",
  "dialogueThread",
  "dialogueMessage",
  "compareResult",
] as const;

export type VocalModelName = (typeof VOCAL_MODEL_INVENTORY)[number];
export type VocalDump = Record<VocalModelName, Record<string, unknown>[]>;

const RELATION_KEYS: Record<VocalModelName, string[]> = {
  criterion: [],
  creatorProfile: ["revisions", "dialogueThreads", "aiCalls"],
  profileRevision: ["profile"],
  reel: [
    "takes",
    "contextSnapshots",
    "reviews",
    "questions",
    "aiCalls",
    "scripts",
    "compares",
    "thoughtCreateKeys",
    "dialogueThreads",
    "scriptDraft",
  ],
  thoughtCreateKey: ["reel"],
  reelContextSnapshot: ["reel"],
  scriptVersion: ["reel", "takes"],
  take: ["reel", "scriptVersion", "jobs", "transcripts", "reviews"],
  transcriptRevision: ["take"],
  job: ["take", "analysis"],
  analysisResult: ["job"],
  aiCall: ["reel", "profile", "reviews"],
  review: ["reel", "take", "aiCall", "questions"],
  question: ["reel", "review", "answers"],
  answer: ["question"],
  scriptDraft: ["reel"],
  dialogueThread: ["reel", "profile", "messages"],
  dialogueMessage: ["thread"],
  compareResult: ["reel"],
};

type Delegate = {
  count: () => Promise<number>;
  findMany: () => Promise<Record<string, unknown>[]>;
  upsert: (args: { where: object; create: object; update: object }) => Promise<unknown>;
};

function delegate(client: PrismaClient, name: VocalModelName): Delegate {
  return client[name] as unknown as Delegate;
}

function scalars(row: Record<string, unknown>, model: VocalModelName) {
  const skip = new Set(RELATION_KEYS[model]);
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (skip.has(key)) continue;
    data[key] = value instanceof Date ? value.toISOString() : value;
  }
  return data;
}

export async function countVocalModels(client: PrismaClient): Promise<Record<VocalModelName, number>> {
  const out = {} as Record<VocalModelName, number>;
  for (const name of VOCAL_MODEL_INVENTORY) {
    out[name] = await delegate(client, name).count();
  }
  return out;
}

export async function readVocalDump(client: PrismaClient): Promise<VocalDump> {
  const dump = {} as VocalDump;
  for (const name of VOCAL_MODEL_INVENTORY) {
    const rows = await delegate(client, name).findMany();
    dump[name] = rows.map((row) => scalars(row, name));
  }
  return dump;
}

async function upsertRow(dest: PrismaClient, name: VocalModelName, data: Record<string, unknown>) {
  if (name === "thoughtCreateKey") {
    await dest.thoughtCreateKey.upsert({
      where: { key: String(data.key) },
      create: data as Prisma.ThoughtCreateKeyUncheckedCreateInput,
      update: data as Prisma.ThoughtCreateKeyUncheckedUpdateInput,
    });
    return;
  }
  const id = data.id;
  if (typeof id !== "string") throw new Error(`${name} row is missing id.`);
  await delegate(dest, name).upsert({
    where: { id },
    create: data,
    update: data,
  });
}

export async function writeVocalDump(dest: PrismaClient, dump: VocalDump) {
  for (const row of dump.creatorProfile) {
    await upsertRow(dest, "creatorProfile", { ...row, currentRevisionId: null });
  }
  for (const row of dump.criterion) await upsertRow(dest, "criterion", row);
  for (const row of dump.profileRevision) await upsertRow(dest, "profileRevision", row);
  for (const row of dump.creatorProfile) {
    await dest.creatorProfile.update({
      where: { id: String(row.id) },
      data: { currentRevisionId: (row.currentRevisionId as string | null) ?? null },
    });
  }
  const rest: VocalModelName[] = [
    "reel",
    "thoughtCreateKey",
    "reelContextSnapshot",
    "scriptVersion",
    "take",
    "transcriptRevision",
    "job",
    "analysisResult",
    "aiCall",
    "review",
    "question",
    "answer",
    "scriptDraft",
    "dialogueThread",
    "dialogueMessage",
    "compareResult",
  ];
  for (const name of rest) {
    for (const row of dump[name]) await upsertRow(dest, name, row);
  }
}

export async function copyVocalDatabase(source: PrismaClient, dest: PrismaClient) {
  const dump = await readVocalDump(source);
  await writeVocalDump(dest, dump);
  return {
    source: await countVocalModels(source),
    dest: await countVocalModels(dest),
  };
}

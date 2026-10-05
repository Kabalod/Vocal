import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { ownerUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { ReelError } from "@/lib/reels";
import { audioDir, audioPathFor, isPathInsideRoot, videoDir } from "@/lib/storage";

/**
 * Data deletion contract: docs/audit/S2_CONTRACT.md.
 * Rows go in one transaction (Job → Reel lock order, like the media publish). Files go after the
 * commit; whatever fails or is written later by a stale worker is collected by sweepOrphanMedia().
 */

export const THOUGHT_KEY_TOMBSTONE_KIND = "deleted_thought_key";
const ORPHAN_GRACE_MS = 60 * 60_000;

type Tx = Prisma.TransactionClient;

export function thoughtKeyTombstoneTurnKey(key: string) {
  return `tck:${key}`;
}

/** Replay guard: a deleted thought's creation key must not create the thought again. */
export async function assertThoughtKeyNotDeleted(key: string): Promise<void> {
  const row = await prisma.aiCall.findUnique({
    where: { turnKey: thoughtKeyTombstoneTurnKey(key) },
    select: { id: true },
  });
  if (row) {
    throw new ReelError("Эта мысль уже была удалена. Создайте новую.", "THOUGHT_DELETED", 410);
  }
}

/**
 * Accounting rows survive (kind, model, status, tokens: the daily budget must not be resettable by
 * deleting), but everything that can hold author content or point at deleted rows is cleared.
 * Running calls are failed and fenced so a stale writer cannot put a reply back.
 */
async function anonymizeAiCalls(tx: Tx, where: Prisma.AiCallWhereInput, owner?: string) {
  await tx.aiCall.updateMany({
    where: { AND: [where, { status: { in: ["queued", "running"] } }] },
    data: { status: "error" },
  });
  await tx.aiCall.updateMany({
    where,
    data: {
      promptText: "",
      inputSnapshotJson: "{}",
      responseText: null,
      resultJson: null,
      errorMessage: null,
      reelId: null,
      profileId: null,
      takeId: null,
      reviewId: null,
      execOwnerId: null,
      execLeaseUntil: null,
      execGeneration: { increment: 1 },
      ...(owner ? { ownerUserId: owner } : {}),
    },
  });
}

function lockedIds(rows: { id: string }[]) {
  return rows.map((row) => row.id);
}

async function lockJobs(tx: Tx, jobIds: string[]) {
  if (!jobIds.length) return;
  await tx.$queryRaw`SELECT id FROM "Job" WHERE id IN (${Prisma.join(jobIds)}) ORDER BY id FOR UPDATE`;
}

type FilePaths = Set<string>;

function addStored(files: FilePaths, storedPath: string | null | undefined) {
  if (storedPath && !storedPath.startsWith("vocal-private:")) files.add(storedPath);
}

/** Deletes one thought of `owner` inside `tx`. Returns the files to remove after commit. */
async function deleteThoughtInTx(tx: Tx, owner: string, reelId: string): Promise<FilePaths> {
  const reel = await tx.reel.findFirst({ where: { id: reelId, ownerUserId: owner }, select: { id: true } });
  if (!reel) throw new ReelError("Карточка не найдена.", "REEL_NOT_FOUND", 404);

  // Same order as the media publish (Job, then Reel) so an active worker and a delete never deadlock.
  const firstJobs = await tx.job.findMany({ where: { take: { reelId } }, select: { id: true } });
  await lockJobs(tx, lockedIds(firstJobs));
  await tx.$queryRaw`SELECT id FROM "Reel" WHERE id = ${reelId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "ThoughtState" WHERE "reelId" = ${reelId} FOR UPDATE`;

  // Anything added between the first read and the locks is read again under the lock.
  const takes = await tx.take.findMany({ where: { reelId }, select: { id: true, storedPath: true } });
  const takeIds = takes.map((take) => take.id);
  const jobs = await tx.job.findMany({
    where: { takeId: { in: takeIds } },
    select: { id: true, videoPath: true, audioPath: true },
  });
  await lockJobs(tx, lockedIds(jobs));

  const files: FilePaths = new Set();
  for (const take of takes) addStored(files, take.storedPath);
  for (const job of jobs) {
    addStored(files, job.videoPath === "pending" ? null : job.videoPath);
    addStored(files, job.audioPath);
    files.add(audioPathFor(job.id));
  }

  const key = await tx.thoughtCreateKey.findUnique({ where: { reelId }, select: { key: true } });
  if (key) {
    await tx.aiCall.upsert({
      where: { turnKey: thoughtKeyTombstoneTurnKey(key.key) },
      create: {
        kind: THOUGHT_KEY_TOMBSTONE_KIND,
        model: "none",
        status: "done",
        ownerUserId: owner,
        promptText: "",
        inputSnapshotJson: "{}",
        turnKey: thoughtKeyTombstoneTurnKey(key.key),
        promptTokens: 0,
        completionTokens: 0,
      },
      update: {},
    });
  }

  await anonymizeAiCalls(tx, { reelId });
  const threads = await tx.dialogueThread.findMany({ where: { reelId }, select: { id: true } });
  await tx.dialogueMessage.deleteMany({ where: { threadId: { in: lockedIds(threads) } } });
  await tx.dialogueThread.deleteMany({ where: { reelId } });

  await tx.answer.deleteMany({ where: { question: { reelId } } });
  await tx.question.deleteMany({ where: { reelId } });
  await tx.review.deleteMany({ where: { reelId } });
  await tx.compareResult.deleteMany({ where: { reelId } });

  // Reel → Take FKs (working take) block the take delete; clear them before the rows go.
  await tx.reel.update({ where: { id: reelId }, data: { workingTakeId: null } });
  await tx.thoughtState.deleteMany({ where: { reelId } });
  await tx.transcriptRevision.deleteMany({ where: { takeId: { in: takeIds } } });
  await tx.job.deleteMany({ where: { id: { in: lockedIds(jobs) } } }); // AnalysisResult cascades
  await tx.take.deleteMany({ where: { reelId } });
  await tx.scriptDraft.deleteMany({ where: { reelId } });
  await tx.scriptVersion.deleteMany({ where: { reelId } });
  await tx.reelContextSnapshot.deleteMany({ where: { reelId } });
  await tx.thoughtCreateKey.deleteMany({ where: { reelId } });
  await tx.reel.delete({ where: { id: reelId } });
  return files;
}

function underStorage(file: string) {
  return isPathInsideRoot(videoDir(), file) || isPathInsideRoot(audioDir(), file);
}

/** Removes files after the transaction. Missing files are fine; real failures are left to the sweeper. */
async function removeFiles(files: Iterable<string>): Promise<{ removed: number; failed: number }> {
  let removed = 0;
  let failed = 0;
  for (const file of files) {
    if (!underStorage(file)) continue;
    try {
      await fs.unlink(file);
      removed += 1;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") failed += 1;
    }
  }
  return { removed, failed };
}

export async function deleteThought(reelId: string): Promise<{ deleted: true }> {
  const owner = ownerUserId();
  const files = await prisma.$transaction((tx) => deleteThoughtInTx(tx, owner, reelId), { timeout: 30_000 });
  await removeFiles(files);
  return { deleted: true };
}

export async function deleteTake(takeId: string): Promise<{ deleted: true }> {
  const owner = ownerUserId();
  const files = await prisma.$transaction(
    async (tx) => {
      const found = await tx.take.findFirst({
        where: { id: takeId, reel: { ownerUserId: owner } },
        select: { id: true, reelId: true, storedPath: true },
      });
      if (!found) throw new ReelError("Дубль не найден.", "TAKE_NOT_FOUND", 404);
      const reelId = found.reelId;

      const firstJobs = await tx.job.findMany({ where: { takeId }, select: { id: true } });
      await lockJobs(tx, lockedIds(firstJobs));
      await tx.$queryRaw`SELECT id FROM "Reel" WHERE id = ${reelId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "ThoughtState" WHERE "reelId" = ${reelId} FOR UPDATE`;

      const reel = await tx.reel.findUniqueOrThrow({
        where: { id: reelId },
        select: { workingTakeId: true, finalTakeId: true, selectedTakeId: true },
      });
      const state = await tx.thoughtState.findUnique({ where: { reelId }, select: { workingTakeId: true } });
      if ((await tx.take.count({ where: { reelId } })) <= 1) {
        throw new ReelError("Это единственный дубль мысли. Удалите мысль целиком.", "LAST_TAKE", 409);
      }
      if (reel.workingTakeId === takeId || state?.workingTakeId === takeId) {
        throw new ReelError("Это рабочий дубль. Сначала выберите другой рабочий дубль.", "WORKING_TAKE", 409);
      }
      if (reel.finalTakeId === takeId) {
        throw new ReelError("Это итоговый дубль. Сначала выберите другой итоговый дубль.", "FINAL_TAKE", 409);
      }

      const jobs = await tx.job.findMany({
        where: { takeId },
        select: { id: true, videoPath: true, audioPath: true },
      });
      await lockJobs(tx, lockedIds(jobs));
      const files: FilePaths = new Set();
      addStored(files, found.storedPath);
      for (const job of jobs) {
        addStored(files, job.videoPath === "pending" ? null : job.videoPath);
        addStored(files, job.audioPath);
        files.add(audioPathFor(job.id));
      }

      await anonymizeAiCalls(tx, { takeId });
      await tx.answer.deleteMany({ where: { question: { review: { takeId } } } });
      await tx.question.deleteMany({ where: { review: { takeId } } });
      await tx.review.deleteMany({ where: { takeId } });
      await tx.compareResult.deleteMany({
        where: { reelId, OR: [{ leftTakeId: takeId }, { rightTakeId: takeId }] },
      });
      await tx.transcriptRevision.deleteMany({ where: { takeId } });
      await tx.job.deleteMany({ where: { id: { in: lockedIds(jobs) } } });
      await tx.take.delete({ where: { id: takeId } });
      if (reel.selectedTakeId === takeId) {
        await tx.reel.update({ where: { id: reelId }, data: { selectedTakeId: null } });
      }
      return files;
    },
    { timeout: 30_000 },
  );
  await removeFiles(files);
  return { deleted: true };
}

export function anonymizedOwnerId(owner: string) {
  return `deleted:${createHash("sha256").update(owner).digest("hex").slice(0, 16)}`;
}

/** All app data of `owner`. The auth user and public.profiles are removed by the caller afterwards. */
export async function deleteAccountData(owner: string): Promise<{ thoughts: number }> {
  const reels = await prisma.reel.findMany({ where: { ownerUserId: owner }, select: { id: true } });
  for (const reel of reels) {
    const files = await prisma.$transaction((tx) => deleteThoughtInTx(tx, owner, reel.id), { timeout: 30_000 });
    await removeFiles(files);
  }

  const files: FilePaths = new Set();
  await prisma.$transaction(
    async (tx) => {
      const strayJobs = await tx.job.findMany({
        where: { ownerUserId: owner },
        select: { id: true, videoPath: true, audioPath: true },
      });
      await lockJobs(tx, lockedIds(strayJobs));
      for (const job of strayJobs) {
        addStored(files, job.videoPath === "pending" ? null : job.videoPath);
        addStored(files, job.audioPath);
        files.add(audioPathFor(job.id));
      }
      await tx.job.deleteMany({ where: { id: { in: lockedIds(strayJobs) } } });

      const profile = await tx.creatorProfile.findUnique({ where: { ownerUserId: owner }, select: { id: true } });
      if (profile) {
        await tx.$queryRaw`SELECT id FROM "CreatorProfile" WHERE id = ${profile.id} FOR UPDATE`;
        const threads = await tx.dialogueThread.findMany({ where: { profileId: profile.id }, select: { id: true } });
        await tx.dialogueMessage.deleteMany({ where: { threadId: { in: lockedIds(threads) } } });
        await tx.dialogueThread.deleteMany({ where: { profileId: profile.id } });
        await anonymizeAiCalls(tx, { profileId: profile.id });
        await tx.profileRevision.deleteMany({ where: { profileId: profile.id } });
        await tx.creatorProfile.delete({ where: { id: profile.id } });
      }
      // Remaining accounting rows keep their counts but lose the account id.
      await anonymizeAiCalls(tx, { ownerUserId: owner }, anonymizedOwnerId(owner));
    },
    { timeout: 30_000 },
  );
  await removeFiles(files);
  return { thoughts: reels.length };
}

const ORPHAN_NAME = /^(take-)?([a-z0-9]{20,})\.[a-z0-9]+$/i;

/**
 * Collects media nobody references: leftovers of failed unlinks and files a stale worker wrote
 * after its thought was deleted. Stateless, so a crash between commit and unlink loses nothing.
 */
export async function sweepOrphanMedia(now = new Date()): Promise<{ removed: number }> {
  const [takes, jobs] = await Promise.all([
    prisma.take.findMany({ select: { id: true, storedPath: true } }),
    prisma.job.findMany({ select: { id: true, videoPath: true, audioPath: true } }),
  ]);
  const takeIds = new Set(takes.map((row) => row.id));
  const jobIds = new Set(jobs.map((row) => row.id));
  const referenced = new Set<string>();
  for (const take of takes) if (take.storedPath) referenced.add(path.resolve(take.storedPath));
  for (const job of jobs) {
    referenced.add(path.resolve(job.videoPath));
    if (job.audioPath) referenced.add(path.resolve(job.audioPath));
    referenced.add(path.resolve(audioPathFor(job.id)));
  }

  let removed = 0;
  for (const dir of [videoDir(), audioDir()]) {
    let names: string[] = [];
    try {
      names = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      const match = ORPHAN_NAME.exec(name);
      if (!match) continue;
      const file = path.resolve(dir, name);
      if (referenced.has(file)) continue;
      const live = match[1] ? takeIds.has(match[2]) : jobIds.has(match[2]);
      if (live) continue;
      try {
        const stat = await fs.stat(file);
        if (now.getTime() - stat.mtimeMs < ORPHAN_GRACE_MS) continue;
        await fs.unlink(file);
        removed += 1;
      } catch {
        /* retried on the next sweep */
      }
    }
  }
  return { removed };
}

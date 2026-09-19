import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { isPrivateObjectPath, PRIVATE_MEDIA_BUCKET, PRIVATE_MEDIA_PREFIX } from "../../src/lib/media-access";

export type MediaUpload = (input: {
  objectPath: string;
  filePath: string;
  bytes: number;
  contentType: string;
}) => Promise<{ bytes: number }>;

export class MediaTransferError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaTransferError";
  }
}

function extOf(filePath: string, fallback: string) {
  return path.extname(filePath).toLowerCase() || fallback;
}

function objectPathFor(owner: string, kind: string, id: string, filePath: string, fallbackExt: string) {
  const ext = extOf(filePath, fallbackExt);
  return `${owner}/${kind}/${id}${ext}`;
}

export function storageOwner(rowOwner: string, legacyOwner: string) {
  return rowOwner === "local" ? legacyOwner : rowOwner;
}

export async function transferLocalMedia(
  prisma: PrismaClient,
  options: {
    upload: MediaUpload;
    legacyOwner: string;
  },
) {
  const transferred: Array<{ kind: string; id: string; objectPath: string; bytes: number }> = [];
  const skippedPrivate: string[] = [];

  const takes = await prisma.take.findMany({
    where: { storedPath: { not: null } },
    select: { id: true, storedPath: true, mimeType: true, reel: { select: { ownerUserId: true } } },
  });
  for (const take of takes) {
    const stored = take.storedPath;
    if (!stored) continue;
    if (isPrivateObjectPath(stored)) {
      skippedPrivate.push(take.id);
      continue;
    }
    if (!existsSync(stored)) {
      throw new MediaTransferError(`Take media missing on disk: ${take.id}`);
    }
    const bytes = statSync(stored).size;
    const owner = storageOwner(take.reel.ownerUserId, options.legacyOwner);
    const objectPath = objectPathFor(owner, "takes", take.id, stored, ".bin");
    const uploaded = await options.upload({
      objectPath,
      filePath: stored,
      bytes,
      contentType: take.mimeType || "application/octet-stream",
    });
    if (uploaded.bytes !== bytes) {
      throw new MediaTransferError(`Take media size mismatch after upload: ${take.id}`);
    }
    const next = `${PRIVATE_MEDIA_PREFIX}${objectPath}`;
    await prisma.take.update({ where: { id: take.id }, data: { storedPath: next } });
    transferred.push({ kind: "take", id: take.id, objectPath, bytes });
  }

  const jobs = await prisma.job.findMany({
    select: { id: true, videoPath: true, audioPath: true, ownerUserId: true },
  });
  for (const job of jobs) {
    const owner = storageOwner(job.ownerUserId, options.legacyOwner);
    if (job.videoPath && job.videoPath !== "pending" && !isPrivateObjectPath(job.videoPath)) {
      if (!existsSync(job.videoPath)) {
        throw new MediaTransferError(`Job video missing on disk: ${job.id}`);
      }
      const bytes = statSync(job.videoPath).size;
      const objectPath = objectPathFor(owner, "jobs", `${job.id}-video`, job.videoPath, ".mp4");
      const uploaded = await options.upload({
        objectPath,
        filePath: job.videoPath,
        bytes,
        contentType: "application/octet-stream",
      });
      if (uploaded.bytes !== bytes) {
        throw new MediaTransferError(`Job video size mismatch after upload: ${job.id}`);
      }
      await prisma.job.update({
        where: { id: job.id },
        data: { videoPath: `${PRIVATE_MEDIA_PREFIX}${objectPath}` },
      });
      transferred.push({ kind: "job-video", id: job.id, objectPath, bytes });
    }
    if (job.audioPath && !isPrivateObjectPath(job.audioPath)) {
      if (!existsSync(job.audioPath)) {
        throw new MediaTransferError(`Job audio missing on disk: ${job.id}`);
      }
      const bytes = statSync(job.audioPath).size;
      const objectPath = objectPathFor(owner, "jobs", `${job.id}-audio`, job.audioPath, ".mp3");
      const uploaded = await options.upload({
        objectPath,
        filePath: job.audioPath,
        bytes,
        contentType: "audio/mpeg",
      });
      if (uploaded.bytes !== bytes) {
        throw new MediaTransferError(`Job audio size mismatch after upload: ${job.id}`);
      }
      await prisma.job.update({
        where: { id: job.id },
        data: { audioPath: `${PRIVATE_MEDIA_PREFIX}${objectPath}` },
      });
      transferred.push({ kind: "job-audio", id: job.id, objectPath, bytes });
    }
  }

  return { transferred, skippedPrivate };
}

export function createSupabaseMediaUpload(env: {
  url: string;
  serviceRoleKey: string;
}): MediaUpload {
  const supabase = createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return async ({ objectPath, filePath, bytes, contentType }) => {
    const body = readFileSync(filePath);
    const { error } = await supabase.storage.from(PRIVATE_MEDIA_BUCKET).upload(objectPath, body, {
      contentType,
      upsert: true,
    });
    if (error) throw new MediaTransferError(error.message);
    return { bytes };
  };
}

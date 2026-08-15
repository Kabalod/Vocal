import fs from "fs/promises";
import path from "path";

export const ROOT = process.cwd();
export const VIDEO_DIR = path.join(ROOT, "storage", "videos");
export const AUDIO_DIR = path.join(ROOT, "storage", "audio");

export async function ensureStorageDirs() {
  await fs.mkdir(VIDEO_DIR, { recursive: true });
  await fs.mkdir(AUDIO_DIR, { recursive: true });
}

export function videoPathFor(jobId: string, originalName: string) {
  const ext = path.extname(originalName).toLowerCase() || ".mp4";
  return path.join(VIDEO_DIR, `${jobId}${ext}`);
}

export function audioPathFor(jobId: string) {
  return path.join(AUDIO_DIR, `${jobId}.mp3`);
}

import fs from "fs/promises";
import path from "path";

function storageRoot() {
  return process.env.VOCAL_STORAGE_ROOT || process.cwd();
}

export function videoDir() {
  return path.join(storageRoot(), "storage", "videos");
}

export function audioDir() {
  return path.join(storageRoot(), "storage", "audio");
}

export const VIDEO_DIR = videoDir();
export const AUDIO_DIR = audioDir();

export async function ensureStorageDirs() {
  await fs.mkdir(videoDir(), { recursive: true });
  await fs.mkdir(audioDir(), { recursive: true });
}

export function videoPathFor(jobId: string, originalName: string) {
  const ext = path.extname(originalName).toLowerCase() || ".mp4";
  return path.join(videoDir(), `${jobId}${ext}`);
}

export function audioPathFor(jobId: string) {
  return path.join(audioDir(), `${jobId}.mp3`);
}

export function takeMediaPathFor(takeId: string, originalName: string, kind: "video" | "audio") {
  const ext = path.extname(originalName).toLowerCase() || (kind === "audio" ? ".mp3" : ".mp4");
  const dir = kind === "audio" ? audioDir() : videoDir();
  return path.join(dir, `take-${takeId}${ext}`);
}

export function isPathInsideRoot(rootDir: string, candidate: string) {
  const rel = path.relative(rootDir, candidate);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

export async function assertStoredMediaPath(candidate: string): Promise<string> {
  const resolved = await fs.realpath(candidate);
  const roots = await Promise.all(
    [videoDir(), audioDir()].map(async (dir) => {
      await fs.mkdir(dir, { recursive: true });
      return fs.realpath(dir);
    }),
  );
  if (roots.some((root) => isPathInsideRoot(root, resolved))) return resolved;
  throw new Error("MEDIA_PATH_DENIED");
}

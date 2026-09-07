import { createHash } from "node:crypto";
import { copyFile, cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export interface BackupManifest {
  createdAt: string;
  note: string;
  databaseFile: string | null;
  videos: string[];
  audio: string[];
}

const STOP_WRITES_NOTE =
  "Остановите npm run dev и другие процессы, пишущие в БД и storage, затем копируйте. Восстановление только в отдельный каталог, не поверх рабочей БД.";

function dbPathFromEnv(cwd: string, databaseUrl?: string) {
  const raw = databaseUrl ?? process.env.DATABASE_URL ?? "file:./dev.db";
  const file = raw.startsWith("file:") ? raw.slice("file:".length) : raw;
  const cleaned = file.replace(/^\.\//, "");
  return path.isAbsolute(cleaned) ? cleaned : path.resolve(cwd, cleaned.startsWith("prisma") ? cleaned : path.join("prisma", path.basename(cleaned)));
}

async function exists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(dir: string): Promise<string[]> {
  try {
    const names = await readdir(dir);
    const out: string[] = [];
    for (const name of names) {
      const full = path.join(dir, name);
      const info = await stat(full);
      if (info.isFile()) out.push(name);
    }
    return out.sort();
  } catch {
    return [];
  }
}

export async function createAppBackup(options: {
  destDir: string;
  cwd?: string;
  databaseUrl?: string;
}): Promise<BackupManifest> {
  const cwd = options.cwd ?? process.cwd();
  const dest = path.resolve(options.destDir);
  await mkdir(dest, { recursive: true });
  const dbSrc = dbPathFromEnv(cwd, options.databaseUrl);
  let databaseFile: string | null = null;
  if (await exists(dbSrc)) {
    databaseFile = "dev.db";
    await copyFile(dbSrc, path.join(dest, "dev.db"));
  }
  const storageRoot = process.env.VOCAL_STORAGE_ROOT || cwd;
  const videosSrc = path.join(storageRoot, "storage", "videos");
  const audioSrc = path.join(storageRoot, "storage", "audio");
  const videosDest = path.join(dest, "storage", "videos");
  const audioDest = path.join(dest, "storage", "audio");
  await mkdir(videosDest, { recursive: true });
  await mkdir(audioDest, { recursive: true });
  if (await exists(videosSrc)) await cp(videosSrc, videosDest, { recursive: true });
  if (await exists(audioSrc)) await cp(audioSrc, audioDest, { recursive: true });
  const manifest: BackupManifest = {
    createdAt: new Date().toISOString(),
    note: STOP_WRITES_NOTE,
    databaseFile,
    videos: await listFiles(videosDest),
    audio: await listFiles(audioDest),
  };
  await writeFile(path.join(dest, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  return manifest;
}

export async function restoreAppBackup(options: {
  fromDir: string;
  toDir: string;
}): Promise<BackupManifest> {
  const from = path.resolve(options.fromDir);
  const to = path.resolve(options.toDir);
  if (path.resolve(from) === path.resolve(to)) {
    throw new Error("RESTORE_SAME_DIR");
  }
  await mkdir(to, { recursive: true });
  const dbFrom = path.join(from, "dev.db");
  if (await exists(dbFrom)) {
    await mkdir(path.join(to, "prisma"), { recursive: true });
    await copyFile(dbFrom, path.join(to, "prisma", "dev.db"));
  }
  const videosFrom = path.join(from, "storage", "videos");
  const audioFrom = path.join(from, "storage", "audio");
  if (await exists(videosFrom)) await cp(videosFrom, path.join(to, "storage", "videos"), { recursive: true });
  if (await exists(audioFrom)) await cp(audioFrom, path.join(to, "storage", "audio"), { recursive: true });
  const manifestPath = path.join(from, "manifest.json");
  if (await exists(manifestPath)) {
    const raw = await readFile(manifestPath, "utf8");
    return JSON.parse(raw) as BackupManifest;
  }
  return {
    createdAt: new Date().toISOString(),
    note: STOP_WRITES_NOTE,
    databaseFile: (await exists(dbFrom)) ? "dev.db" : null,
    videos: await listFiles(path.join(to, "storage", "videos")),
    audio: await listFiles(path.join(to, "storage", "audio")),
  };
}

export async function sha256File(filePath: string): Promise<string> {
  const buf = await readFile(filePath);
  return createHash("sha256").update(buf).digest("hex");
}

import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
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
  const databaseFile = null;
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
    databaseFile: null,
    videos: await listFiles(path.join(to, "storage", "videos")),
    audio: await listFiles(path.join(to, "storage", "audio")),
  };
}

export async function sha256File(filePath: string): Promise<string> {
  const buf = await readFile(filePath);
  return createHash("sha256").update(buf).digest("hex");
}

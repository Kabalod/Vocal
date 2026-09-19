import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { resolveSqliteFile } from "./sqlite-path";

export class BackupRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupRequiredError";
  }
}

export function sha256File(filePath: string) {
  const hash = createHash("sha256");
  hash.update(readFileSync(filePath));
  return hash.digest("hex");
}

export function createConfirmedSqliteBackup(options: {
  databaseUrl: string;
  schemaPath?: string;
  cwd?: string;
  backupsRoot?: string;
}) {
  const cwd = options.cwd ?? process.cwd();
  const schemaPath = options.schemaPath ?? "prisma/schema.prisma";
  const source = resolveSqliteFile(options.databaseUrl, schemaPath, cwd);
  if (!existsSync(source)) {
    throw new BackupRequiredError(`SQLite file not found: ${path.relative(cwd, source)}`);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(options.backupsRoot ?? path.join(cwd, "backups"), `sqlite-${stamp}`);
  mkdirSync(outDir, { recursive: true });
  const dest = path.join(outDir, "dev.db");
  copyFileSync(source, dest);
  const sourceStat = statSync(source);
  const destStat = statSync(dest);
  if (sourceStat.size !== destStat.size || sourceStat.size === 0) {
    throw new BackupRequiredError("SQLite backup size does not match the source.");
  }
  const sourceHash = sha256File(source);
  const destHash = sha256File(dest);
  if (sourceHash !== destHash) {
    throw new BackupRequiredError("SQLite backup hash does not match the source.");
  }
  const manifest = {
    confirmed: true as const,
    source,
    dest,
    bytes: sourceStat.size,
    sha256: sourceHash,
  };
  writeFileSync(path.join(outDir, "backup-manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}

export function assertConfirmedBackup(manifest: { confirmed?: boolean; dest?: string; sha256?: string } | null) {
  if (!manifest?.confirmed || !manifest.dest || !manifest.sha256) {
    throw new BackupRequiredError("Migration stopped: confirmed SQLite backup is required.");
  }
  if (!existsSync(manifest.dest)) {
    throw new BackupRequiredError("Migration stopped: backup file is missing.");
  }
  if (sha256File(manifest.dest) !== manifest.sha256) {
    throw new BackupRequiredError("Migration stopped: backup file was changed after confirmation.");
  }
}

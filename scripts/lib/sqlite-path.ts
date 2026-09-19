import path from "node:path";

export function resolveSqliteFile(databaseUrl: string, schemaPath: string, cwd = process.cwd()) {
  const raw = databaseUrl.trim();
  if (!raw.startsWith("file:")) {
    throw new Error(`DATABASE_URL is not a sqlite file: ${raw.slice(0, 12)}`);
  }
  const filePart = raw.slice("file:".length);
  if (!filePart) throw new Error("sqlite file path is empty.");
  if (path.isAbsolute(filePart)) return path.normalize(filePart);
  const schemaDir = path.dirname(path.resolve(cwd, schemaPath));
  return path.normalize(path.resolve(schemaDir, filePart));
}

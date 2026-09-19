import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function parseEnvFile(filePath: string) {
  const out: Record<string, string> = {};
  if (!existsSync(filePath)) return out;
  for (const raw of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function hostOf(url: string | undefined) {
  if (!url) return "unset";
  try {
    return new URL(url).host;
  } catch {
    return "invalid-url";
  }
}

function dbKind(url: string | undefined) {
  if (!url) return "unset";
  if (/^postgres(ql)?:/i.test(url)) return "postgres";
  if (url.startsWith("file:")) return "sqlite";
  return "other";
}

function uuidStatus(value: string | undefined) {
  if (!value) return "unset";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? "uuid"
    : "not-uuid";
}

const root = process.cwd();
const merged = {
  ...parseEnvFile(path.join(root, ".env")),
  ...parseEnvFile(path.join(root, ".env.local")),
  ...process.env,
};

const report = {
  supabaseHost: hostOf(merged.NEXT_PUBLIC_SUPABASE_URL),
  publishableKey: merged.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ? "set" : "unset",
  databaseUrl: dbKind(merged.DATABASE_URL),
  postgresDatabaseUrl: dbKind(merged.POSTGRES_DATABASE_URL),
  legacyOwner: uuidStatus(merged.VOCAL_LEGACY_OWNER_USER_ID),
};

console.log(JSON.stringify(report, null, 2));

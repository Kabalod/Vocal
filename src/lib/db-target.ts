export const VOCAL_SUPABASE_PROJECT_REF = "zfbiyyhedhqdgrxxajrj";

export class DatabaseTargetError extends Error {
  readonly code: string;
  constructor(message: string, code = "DATABASE_TARGET") {
    super(message);
    this.name = "DatabaseTargetError";
    this.code = code;
  }
}

export function isAppTestRuntime(env: Record<string, string | undefined> = process.env) {
  if (env.NODE_ENV === "production" || env.NODE_ENV === "development") return false;
  return env.NODE_ENV === "test" || Boolean(env.NODE_TEST_CONTEXT);
}

function parsePostgresUrl(raw: string, label: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new DatabaseTargetError(`${label} должен быть корректным postgresql:// URL.`);
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new DatabaseTargetError(`${label} должен быть postgresql:// URL.`);
  }
  return parsed;
}

function withSslMode(raw: string): string {
  const hashIndex = raw.indexOf("#");
  const withoutHash = hashIndex === -1 ? raw : raw.slice(0, hashIndex);
  const queryIndex = withoutHash.indexOf("?");
  const base = queryIndex === -1 ? withoutHash : withoutHash.slice(0, queryIndex);
  const params = new URLSearchParams(queryIndex === -1 ? "" : withoutHash.slice(queryIndex + 1));
  params.set("sslmode", "require");
  return `${base}?${params.toString()}`;
}

export function assertVocalPostgresUrl(raw: string, label = "DATABASE_URL"): string {
  const parsed = parsePostgresUrl(raw, label);
  const host = parsed.hostname.toLowerCase();
  const user = decodeURIComponent(parsed.username);
  const directHost = `db.${VOCAL_SUPABASE_PROJECT_REF}.supabase.co`;
  const isDirect = host === directHost;
  const isPooler =
    host.endsWith(".pooler.supabase.com") && user === `postgres.${VOCAL_SUPABASE_PROJECT_REF}`;
  if (!isDirect && !isPooler) {
    throw new DatabaseTargetError(`${label} не указывает на проект ${VOCAL_SUPABASE_PROJECT_REF}.`);
  }
  if (isDirect && user && user !== "postgres") {
    throw new DatabaseTargetError(`${label} не указывает на проект ${VOCAL_SUPABASE_PROJECT_REF}.`);
  }
  return withSslMode(raw);
}

export function assertTestDatabaseUrl(
  raw: string,
  env: Record<string, string | undefined> = process.env,
): string {
  const parsed = parsePostgresUrl(raw, "TEST_DATABASE_URL");
  const host = parsed.hostname.toLowerCase();
  if (host.includes("supabase.co") || host.endsWith(".pooler.supabase.com")) {
    throw new DatabaseTargetError("TEST_DATABASE_URL не может указывать на Supabase.");
  }
  const allowRemote = env.VOCAL_ALLOW_NONLOCAL_TEST_DB === "1";
  if (host !== "localhost" && host !== "127.0.0.1" && !allowRemote) {
    throw new DatabaseTargetError("TEST_DATABASE_URL должен быть localhost или 127.0.0.1.");
  }
  return raw;
}

export function resolveAppDatabaseUrl(env: Record<string, string | undefined> = process.env): string {
  if (isAppTestRuntime(env)) {
    const testUrl = env.TEST_DATABASE_URL?.trim();
    if (!testUrl) {
      throw new DatabaseTargetError("Нужен TEST_DATABASE_URL. Тесты не используют SQLite.");
    }
    return assertTestDatabaseUrl(testUrl, env);
  }
  const url = env.DATABASE_URL?.trim();
  if (!url) {
    throw new DatabaseTargetError(
      "Нужен DATABASE_URL. Приложение не переключается на SQLite и не использует владельца local.",
    );
  }
  return assertVocalPostgresUrl(url, "DATABASE_URL");
}

export function resolveDirectDatabaseUrl(env: Record<string, string | undefined> = process.env): string {
  const url = env.DIRECT_URL?.trim();
  if (!url) {
    throw new DatabaseTargetError("Нужен DIRECT_URL для миграций.");
  }
  return assertVocalPostgresUrl(url, "DIRECT_URL");
}

export function assertSupabasePublicTarget(env: Record<string, string | undefined> = process.env) {
  if (isAppTestRuntime(env)) return;
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || "";
  if (!url || !key) {
    throw new DatabaseTargetError(
      "Нужны NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new DatabaseTargetError("NEXT_PUBLIC_SUPABASE_URL не указывает на проект zfbiyyhedhqdgrxxajrj.");
  }
  if (parsed.hostname.toLowerCase() !== `${VOCAL_SUPABASE_PROJECT_REF}.supabase.co`) {
    throw new DatabaseTargetError("NEXT_PUBLIC_SUPABASE_URL не указывает на проект zfbiyyhedhqdgrxxajrj.");
  }
}

export function assertAppDatabaseReady(env: Record<string, string | undefined> = process.env) {
  assertSupabasePublicTarget(env);
  resolveAppDatabaseUrl(env);
}

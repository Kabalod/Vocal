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

export function expectedPrismaProvider(
  env: Record<string, string | undefined> = process.env,
): "postgresql" | "sqlite" {
  return isAppTestRuntime(env) ? "sqlite" : "postgresql";
}

export function assertVocalPostgresUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new DatabaseTargetError("POSTGRES_DATABASE_URL должен быть корректным postgresql:// URL.");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new DatabaseTargetError("POSTGRES_DATABASE_URL должен быть postgresql:// URL проекта zfbiyyhedhqdgrxxajrj.");
  }
  const host = parsed.hostname.toLowerCase();
  const user = decodeURIComponent(parsed.username);
  const directHost = `db.${VOCAL_SUPABASE_PROJECT_REF}.supabase.co`;
  const isDirect = host === directHost;
  const isPooler =
    host.endsWith(".pooler.supabase.com") && user === `postgres.${VOCAL_SUPABASE_PROJECT_REF}`;
  if (!isDirect && !isPooler) {
    throw new DatabaseTargetError("POSTGRES_DATABASE_URL не указывает на проект zfbiyyhedhqdgrxxajrj.");
  }
  if (isDirect && user && user !== "postgres") {
    throw new DatabaseTargetError("POSTGRES_DATABASE_URL не указывает на проект zfbiyyhedhqdgrxxajrj.");
  }
  const hashIndex = raw.indexOf("#");
  const withoutHash = hashIndex === -1 ? raw : raw.slice(0, hashIndex);
  const queryIndex = withoutHash.indexOf("?");
  const base = queryIndex === -1 ? withoutHash : withoutHash.slice(0, queryIndex);
  const params = new URLSearchParams(queryIndex === -1 ? "" : withoutHash.slice(queryIndex + 1));
  params.set("sslmode", "require");
  return `${base}?${params.toString()}`;
}

export function resolveAppDatabaseUrl(env: Record<string, string | undefined> = process.env): string {
  if (isAppTestRuntime(env)) {
    const url = env.DATABASE_URL?.trim();
    if (!url) return "file:./prisma/dev.db";
    if (!url.startsWith("file:")) {
      throw new DatabaseTargetError("В тестах DATABASE_URL должен быть file: SQLite.");
    }
    return url;
  }
  const postgres = env.POSTGRES_DATABASE_URL?.trim();
  if (!postgres) {
    throw new DatabaseTargetError(
      "Нужен POSTGRES_DATABASE_URL. Приложение не переключается на SQLite и не использует владельца local.",
    );
  }
  return assertVocalPostgresUrl(postgres);
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

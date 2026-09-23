export const VOCAL_SUPABASE_PROJECT_REF = "zfbiyyhedhqdgrxxajrj";

export class DatabaseTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseTargetError";
  }
}

export function isAppTestRuntime(env: Record<string, string | undefined> = process.env) {
  if (env.NODE_ENV === "production" || env.NODE_ENV === "development") return false;
  return env.NODE_ENV === "test" || Boolean(env.NODE_TEST_CONTEXT);
}

export function resolveAppDatabaseUrl(env: Record<string, string | undefined> = process.env): string {
  if (isAppTestRuntime(env)) {
    const url = env.DATABASE_URL?.trim();
    if (!url) return "file:./prisma/dev.db";
    return url;
  }
  const postgres = env.POSTGRES_DATABASE_URL?.trim();
  if (!postgres) {
    throw new DatabaseTargetError(
      "Нужен POSTGRES_DATABASE_URL. Приложение не переключается на SQLite и не использует владельца local.",
    );
  }
  if (postgres.startsWith("file:") || !/^postgres(ql)?:/i.test(postgres)) {
    throw new DatabaseTargetError(
      "POSTGRES_DATABASE_URL должен быть postgresql:// URL проекта zfbiyyhedhqdgrxxajrj.",
    );
  }
  if (!postgres.includes(VOCAL_SUPABASE_PROJECT_REF)) {
    throw new DatabaseTargetError(
      "POSTGRES_DATABASE_URL не указывает на проект zfbiyyhedhqdgrxxajrj.",
    );
  }
  if (!/sslmode=/i.test(postgres)) {
    return `${postgres}${postgres.includes("?") ? "&" : "?"}sslmode=require`;
  }
  return postgres;
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
  if (!url.includes(VOCAL_SUPABASE_PROJECT_REF)) {
    throw new DatabaseTargetError(
      "NEXT_PUBLIC_SUPABASE_URL не указывает на проект zfbiyyhedhqdgrxxajrj.",
    );
  }
}

import { loadVocalEnv } from "./lib/load-env";

loadVocalEnv();

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

const report = {
  supabaseHost: hostOf(process.env.NEXT_PUBLIC_SUPABASE_URL),
  publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ? "set" : "unset",
  databaseUrl: dbKind(process.env.DATABASE_URL),
  directUrl: dbKind(process.env.DIRECT_URL),
  testDatabaseUrl: dbKind(process.env.TEST_DATABASE_URL),
  serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY ? "set" : "unset",
};

console.log(JSON.stringify(report, null, 2));

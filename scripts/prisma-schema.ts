import { existsSync } from "node:fs";

export function resolvePrismaSchema(env: Record<string, string | undefined> = process.env): string {
  const explicit = env.VOCAL_PRISMA_SCHEMA?.trim();
  if (explicit) return explicit;
  const nodeEnv = env.NODE_ENV ?? "";
  if (nodeEnv === "production" || nodeEnv === "development") {
    return "prisma/schema.postgres.prisma";
  }
  if (nodeEnv === "test" || env.NODE_TEST_CONTEXT) {
    return "prisma/schema.prisma";
  }
  return "prisma/schema.postgres.prisma";
}

export function assertSchemaFile(schema: string) {
  if (!existsSync(schema)) {
    throw new Error(`Prisma schema missing: ${schema}`);
  }
}

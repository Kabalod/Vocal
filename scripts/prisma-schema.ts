import { existsSync } from "node:fs";

export function resolvePrismaSchema(env: Record<string, string | undefined> = process.env): string {
  const explicit = env.VOCAL_PRISMA_SCHEMA?.trim();
  if (explicit) return explicit;
  const url = env.DATABASE_URL?.trim() || "";
  if (/^postgres(ql)?:/i.test(url)) return "prisma/schema.postgres.prisma";
  return "prisma/schema.prisma";
}

export function assertSchemaFile(schema: string) {
  if (!existsSync(schema)) {
    throw new Error(`Prisma schema missing: ${schema}`);
  }
}

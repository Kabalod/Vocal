import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseTargetError, expectedPrismaProvider } from "@/lib/db-target";

function readGeneratedPrismaProvider(): "postgresql" | "sqlite" | "unknown" {
  const candidates = [
    join(process.cwd(), "node_modules", ".prisma", "client", "schema.prisma"),
    join(process.cwd(), "node_modules", "@prisma", "client", "schema.prisma"),
  ];
  for (const schemaPath of candidates) {
    if (!existsSync(schemaPath)) continue;
    const source = readFileSync(schemaPath, "utf8");
    const match = source.match(/^\s*provider\s*=\s*"(postgresql|sqlite)"/m);
    if (match?.[1] === "postgresql" || match?.[1] === "sqlite") return match[1];
  }
  return "unknown";
}

export function assertGeneratedPrismaProvider(env: Record<string, string | undefined> = process.env) {
  const expected = expectedPrismaProvider(env);
  const generated = readGeneratedPrismaProvider();
  if (generated !== expected) {
    throw new DatabaseTargetError(
      `Prisma Client (${generated}) не совпадает с контуром (${expected}). Сгенерируйте клиент этой ветки.`,
      "PRISMA_PROVIDER",
    );
  }
}

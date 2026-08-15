import { PrismaClient } from "@prisma/client";
import { DEFAULT_CRITERIA, LEGACY_CRITERION_IDS } from "@/lib/framework";
import type { CriterionDto } from "@/types/analysis";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

function toRow(c: CriterionDto) {
  return {
    id: c.id,
    label: c.label,
    description: c.description,
    weight: c.weight,
    enabled: c.enabled,
    sortOrder: c.sortOrder,
    isExtended: c.isExtended,
    categoryId: c.categoryId,
    categoryLabel: c.categoryLabel,
    categoryWeight: c.categoryWeight,
    categoryOrder: c.categoryOrder,
  };
}

export async function ensureCriteria() {
  const existing = await prisma.criterion.findMany();
  const knownIds = new Set(DEFAULT_CRITERIA.map((c) => c.id));
  const hasLegacy = existing.some((row) => LEGACY_CRITERION_IDS.includes(row.id));
  const hasUnknown = existing.some((row) => !knownIds.has(row.id));

  if (existing.length === 0 || hasLegacy || hasUnknown) {
    await prisma.criterion.deleteMany();
    await prisma.criterion.createMany({ data: DEFAULT_CRITERIA.map(toRow) });
    return;
  }

  const existingIds = new Set(existing.map((row) => row.id));
  const missing = DEFAULT_CRITERIA.filter((c) => !existingIds.has(c.id));
  if (missing.length > 0) {
    await prisma.criterion.createMany({ data: missing.map(toRow) });
  }
}

export async function resetCriteria() {
  await prisma.criterion.deleteMany();
  await prisma.criterion.createMany({ data: DEFAULT_CRITERIA.map(toRow) });
}

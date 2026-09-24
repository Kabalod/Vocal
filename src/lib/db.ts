import { PrismaClient } from "@prisma/client";
import { DEFAULT_CRITERIA, LEGACY_CRITERION_IDS } from "@/lib/framework";
import type { CriterionDto } from "@/types/analysis";
import { resolveAppDatabaseUrl } from "@/lib/db-target";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrisma() {
  const url = resolveAppDatabaseUrl();
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    datasources: { db: { url } },
  });
}

export let prisma = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/** Для тестов: новый клиент после смены TEST_DATABASE_URL. */
export async function resetPrismaClient() {
  await prisma.$disconnect();
  prisma = createPrisma();
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

  if (existing.length === 0 || hasLegacy) {
    await prisma.criterion.deleteMany();
    await prisma.criterion.createMany({ data: DEFAULT_CRITERIA.map(toRow) });
    return;
  }

  await prisma.$transaction([
    ...DEFAULT_CRITERIA.map((c) =>
      prisma.criterion.upsert({
        where: { id: c.id },
        create: toRow(c),
        update: {
          label: c.label,
          description: c.description,
          weight: c.weight,
          sortOrder: c.sortOrder,
          isExtended: c.isExtended,
          categoryId: c.categoryId,
          categoryLabel: c.categoryLabel,
          categoryWeight: c.categoryWeight,
          categoryOrder: c.categoryOrder,
        },
      }),
    ),
    ...existing
      .filter((row) => !knownIds.has(row.id))
      .map((row) => prisma.criterion.delete({ where: { id: row.id } })),
  ]);
}

export async function resetCriteria() {
  await prisma.criterion.deleteMany();
  await prisma.criterion.createMany({ data: DEFAULT_CRITERIA.map(toRow) });
}

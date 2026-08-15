import { PrismaClient } from "@prisma/client";
import { DEFAULT_CRITERIA } from "../src/lib/framework";

const prisma = new PrismaClient();

async function main() {
  await prisma.criterion.deleteMany();
  await prisma.criterion.createMany({
    data: DEFAULT_CRITERIA.map((c) => ({
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
    })),
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

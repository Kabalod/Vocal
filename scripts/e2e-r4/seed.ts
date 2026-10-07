// Seeds a position into the thought state of every thought in TEST_DATABASE_URL so the "Я понял так…" reply has material.
// The mock model never writes facts, so without this the reply is (correctly) absent.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL! } } });
prisma.thoughtState
  .updateMany({ data: { position: "Тихий вечер помогает мне думать." } })
  .then((r) => console.log("seeded", r.count))
  .finally(() => prisma.$disconnect());

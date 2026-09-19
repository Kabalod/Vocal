import { loadVocalEnv } from "./lib/load-env";
import { legacyOwnerUserId } from "../src/lib/auth/session";
import { PrismaClient } from "@prisma/client";
import { assignLegacyOwner } from "./lib/assign-legacy";
import { PortraitConflictError } from "./lib/portrait-conflict";

loadVocalEnv();

async function main() {
  const owner = legacyOwnerUserId();
  const prisma = new PrismaClient();
  try {
    const result = await assignLegacyOwner(prisma, owner);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    if (error instanceof PortraitConflictError) {
      console.error(JSON.stringify({ ok: false, code: "PORTRAIT_CONFLICT", report: error.report }, null, 2));
      process.exit(2);
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

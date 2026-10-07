// Live: one script assembly per thought already present in the local test database (TEST_DATABASE_URL only).
(process.env as { NODE_ENV?: string }).NODE_ENV = "test";
import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL! } } });
  const { generateV05Script } = await import("../../src/lib/v05-script");
  const { ownerUserId } = await import("../../src/lib/auth/session");
  const reels = await prisma.reel.findMany({ where: { ownerUserId: ownerUserId() }, orderBy: { createdAt: "asc" }, select: { id: true, title: true } });
  let n = 0;
  for (const reel of reels) {
    n += 1;
    try {
      const ws = await generateV05Script(reel.id, { idempotencyKey: `assemble-${n}` });
      console.log(`thought ${n}: script ok, changes=${ws.viewingChanges.length}, bodyChars=${ws.viewing?.body.length ?? 0}`);
    } catch (error) {
      console.log(`thought ${n}: ${(error as { code?: string }).code ?? "error"}: ${error instanceof Error ? error.message.slice(0, 100) : ""}`);
    }
  }
  const calls = await prisma.aiCall.findMany({ where: { kind: "script" }, select: { status: true, promptTokens: true, completionTokens: true } });
  console.log("script calls:", JSON.stringify(calls));
  await prisma.$disconnect();
}
main().then(() => process.exit(0)).catch((e) => { console.error("failed:", e instanceof Error ? e.message.slice(0, 200) : "error"); process.exit(1); });

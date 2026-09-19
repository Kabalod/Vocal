import { PrismaClient } from "@prisma/client";
import { loadVocalEnv } from "./lib/load-env";
import { transferLocalMedia, createSupabaseMediaUpload } from "./lib/media-transfer";

loadVocalEnv();

async function main() {
  const legacyOwner = process.env.VOCAL_LEGACY_OWNER_USER_ID?.trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!legacyOwner) throw new Error("VOCAL_LEGACY_OWNER_USER_ID is required for media transfer.");
  if (!url || !serviceRoleKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  const prisma = new PrismaClient();
  const result = await transferLocalMedia(prisma, {
    legacyOwner,
    upload: createSupabaseMediaUpload({ url, serviceRoleKey }),
  });
  console.log(JSON.stringify({ ok: true, transferred: result.transferred.length, skippedPrivate: result.skippedPrivate.length }, null, 2));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

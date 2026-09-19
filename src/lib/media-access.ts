import { ownerUserId } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const PRIVATE_MEDIA_BUCKET = "vocal-private";
export const PRIVATE_MEDIA_PREFIX = "vocal-private:";

export function isPrivateObjectPath(storedPath: string) {
  return storedPath.startsWith(PRIVATE_MEDIA_PREFIX);
}

export function objectPathFromStored(storedPath: string) {
  return storedPath.slice(PRIVATE_MEDIA_PREFIX.length);
}

/** Owner check before any file bytes or signed URL. */
export function assertOwnedObjectPath(storedPath: string) {
  const owner = ownerUserId();
  if (!isPrivateObjectPath(storedPath)) return;
  const objectPath = objectPathFromStored(storedPath);
  if (!objectPath.startsWith(`${owner}/`)) {
    throw new Error("MEDIA_PATH_DENIED");
  }
}

export async function createOwnedSignedUrl(storedPath: string, expiresIn = 60) {
  assertOwnedObjectPath(storedPath);
  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("MEDIA_PATH_DENIED");
  const { data, error } = await supabase.storage
    .from(PRIVATE_MEDIA_BUCKET)
    .createSignedUrl(objectPathFromStored(storedPath), expiresIn);
  if (error || !data?.signedUrl) throw new Error("MEDIA_PATH_DENIED");
  return data.signedUrl;
}

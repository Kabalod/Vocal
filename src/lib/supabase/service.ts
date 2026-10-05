import { createClient } from "@supabase/supabase-js";
import { isAppTestRuntime, isLocalUiTestRuntime } from "@/lib/db-target";
import { PRIVATE_MEDIA_BUCKET } from "@/lib/media-access";

/**
 * Server-only. The service-role key never reaches the client bundle or logs: this module is imported
 * only from API routes and must not be imported by client components.
 */

export class AccountAuthError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(message: string, code = "ACCOUNT_AUTH", status = 502) {
    super(message);
    this.name = "AccountAuthError";
    this.code = code;
    this.status = status;
  }
}

/** Test-only: replaces the Supabase calls. */
export const accountAuthSeam: { deleteUser: ((userId: string) => Promise<void>) | null } = { deleteUser: null };

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function localRuntime() {
  return isAppTestRuntime() || isLocalUiTestRuntime();
}

/** Checked before any app data is deleted, so a missing key cannot leave a half-deleted account. */
export function accountAuthDeletionAvailable(): boolean {
  return Boolean(accountAuthSeam.deleteUser) || localRuntime() || serviceClient() !== null;
}

/** Removes the bucket objects, public.profiles and auth.users of one account. Idempotent. */
export async function deleteAuthAccount(userId: string): Promise<void> {
  if (accountAuthSeam.deleteUser) return accountAuthSeam.deleteUser(userId);
  const client = serviceClient();
  if (!client) {
    if (localRuntime()) return;
    throw new AccountAuthError("Удаление входа не настроено на сервере.", "ACCOUNT_AUTH_NOT_CONFIGURED", 503);
  }
  const bucket = client.storage.from(PRIVATE_MEDIA_BUCKET);
  const listed = await bucket.list(userId, { limit: 1000 });
  if (!listed.error && listed.data?.length) {
    await bucket.remove(listed.data.map((item) => `${userId}/${item.name}`));
  }
  const profile = await client.from("profiles").delete().eq("id", userId);
  if (profile.error) throw new AccountAuthError("Не удалось удалить профиль входа.");
  const result = await client.auth.admin.deleteUser(userId);
  if (result.error && !/not.?found/i.test(result.error.message)) {
    throw new AccountAuthError("Не удалось удалить учётную запись.");
  }
}

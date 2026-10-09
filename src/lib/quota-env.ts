/** J1: who the quota and the abuse protections apply to. See quota.ts. */
import { ownerUserId } from "@/lib/auth/session";

/** On in production and when VOCAL_QUOTA=on; VOCAL_QUOTA=off forces it off (local dev/test contour). */
export function quotaEnforced(env: Record<string, string | undefined> = process.env): boolean {
  const raw = env.VOCAL_QUOTA?.trim().toLowerCase();
  if (raw === "on") return true;
  if (raw === "off") return false;
  return env.NODE_ENV === "production";
}

/** Owner/dev users (VOCAL_OWNER_USER_IDS, comma separated): no quota, the daily token limit stays. */
export function isOwnerUser(userId: string, env: Record<string, string | undefined> = process.env): boolean {
  return (env.VOCAL_OWNER_USER_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean).includes(userId);
}

/** An ordinary author: quota and abuse protections apply, the per-user daily token limit does not. */
export function isOrdinaryUser(userId = ownerUserId(), env: Record<string, string | undefined> = process.env): boolean {
  return quotaEnforced(env) && !isOwnerUser(userId, env);
}

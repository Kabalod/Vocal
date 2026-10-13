/** J1: who the quota and the abuse protections apply to. See quota.ts. */
import { ownerUserId } from "@/lib/auth/session";

/**
 * Off by default (also in production): enabled only by an explicit VOCAL_QUOTA=on.
 * Migration 11_user_quota must be applied before turning it on.
 */
export function quotaEnforced(env: Record<string, string | undefined> = process.env): boolean {
  return env.VOCAL_QUOTA?.trim().toLowerCase() === "on";
}

/** Owner/dev users (VOCAL_OWNER_USER_IDS, comma separated): no quota, the daily token limit stays. */
export function isOwnerUser(userId: string, env: Record<string, string | undefined> = process.env): boolean {
  return (env.VOCAL_OWNER_USER_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean).includes(userId);
}

/** An ordinary author: quota and abuse protections apply, the per-user daily token limit does not. */
export function isOrdinaryUser(userId = ownerUserId(), env: Record<string, string | undefined> = process.env): boolean {
  return quotaEnforced(env) && !isOwnerUser(userId, env);
}

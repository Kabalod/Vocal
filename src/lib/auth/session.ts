import { AsyncLocalStorage } from "node:async_hooks";
import { isAppTestRuntime } from "@/lib/db-target";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export class AuthError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(message = "Нужен вход.", code = "UNAUTHENTICATED", status = 401) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.status = status;
  }
}

export type AuthUser = { id: string; email: string | null };

const ownerContext = new AsyncLocalStorage<AuthUser>();

function isTestRuntime() {
  return isAppTestRuntime();
}

export function ownerUserId(): string {
  const stored = ownerContext.getStore()?.id;
  if (stored) {
    if (stored === "local" && !isTestRuntime()) {
      throw new AuthError("Нужен вход.", "UNAUTHENTICATED", 401);
    }
    return stored;
  }
  if (isTestRuntime()) {
    return process.env.VOCAL_TEST_USER_ID?.trim() || "local";
  }
  throw new AuthError();
}

export function portraitProfileId(): string {
  return ownerUserId();
}

export function enterWithOwner(user: AuthUser): void {
  ownerContext.enterWith(user);
}

export function runWithOwner<T>(user: AuthUser, fn: () => T): T {
  return ownerContext.run(user, fn);
}

export function ownedReelWhere(id: string) {
  return { id, ownerUserId: ownerUserId() };
}

export async function resolveRequestUser(): Promise<AuthUser> {
  if (isTestRuntime() && process.env.VOCAL_REQUIRE_SUPABASE_AUTH !== "1") {
    return { id: process.env.VOCAL_TEST_USER_ID?.trim() || "local", email: "test@vocal.local" };
  }
  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new AuthError();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) throw new AuthError();
  return { id: data.user.id, email: data.user.email ?? null };
}

export function canWriteSharedCriteria(): boolean {
  const raw = process.env.VOCAL_CRITERIA_ADMIN_USER_IDS ?? "";
  const allow = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (allow.length === 0) return false;
  return allow.includes(ownerUserId());
}

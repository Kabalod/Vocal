import { NextResponse } from "next/server";
import { AuthError, enterWithOwner, resolveRequestUser, runWithOwner, type AuthUser } from "@/lib/auth/session";

export function authErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  return null;
}

export function withApiUser<C>(
  handler: (request: Request, context: C) => Promise<Response> | Response,
): (request: Request, context: C) => Promise<Response> {
  return async (request, context) => {
    try {
      const user = await resolveRequestUser();
      return await runWithOwner(user, () => handler(request, context));
    } catch (error) {
      const response = authErrorResponse(error);
      if (response) return response;
      throw error;
    }
  };
}

export async function bindApiUser(): Promise<AuthUser> {
  const user = await resolveRequestUser();
  enterWithOwner(user);
  return user;
}

/** Keeps owner ALS across awaits. Prefer this over bindApiUser + enterWith. */
export async function asApiUser<T>(fn: () => Promise<T> | T): Promise<T> {
  const user = await resolveRequestUser();
  return runWithOwner(user, fn);
}

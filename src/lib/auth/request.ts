import { NextResponse } from "next/server";
import { AuthError, enterWithOwner, resolveRequestUser, runWithOwner, type AuthUser } from "@/lib/auth/session";

export function authErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  return null;
}

type AppRouteHandler<C> = (request: Request, context: C) => Promise<Response> | Response;

export function withApiUser<C>(handler: AppRouteHandler<C>): AppRouteHandler<C> {
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

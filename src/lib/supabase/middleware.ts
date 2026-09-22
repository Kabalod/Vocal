import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPublicPagePath } from "@/lib/auth/paths";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

export async function updateSupabaseSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const env = getSupabasePublicEnv();
  if (!env) {
    if (process.env.NODE_ENV === "test") return supabaseResponse;
    return NextResponse.json({ error: "Нужен вход.", code: "UNAUTHENTICATED" }, { status: 401 });
  }

  const supabase = createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
        Object.entries(headers).forEach(([key, value]) => {
          supabaseResponse.headers.set(key, value);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthPage = isPublicPagePath(path);
  const isPublicApi = path === "/api/health" || path.startsWith("/auth/callback");
  const isApi = path.startsWith("/api/");

  if (!user && isApi && !isPublicApi) {
    return NextResponse.json({ error: "Нужен вход.", code: "UNAUTHENTICATED" }, { status: 401 });
  }

  if (!user && !isAuthPage && !isPublicApi) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (user && (path === "/login" || path === "/signup")) {
    return NextResponse.redirect(new URL("/reels", request.url));
  }

  return supabaseResponse;
}

import { NextResponse } from "next/server";
import { withApiUser } from "@/lib/auth/request";
import { ownerUserId } from "@/lib/auth/session";
import { renewPeriod } from "@/lib/quota";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * J1: the payment stub. Real payments are not connected; this endpoint exists only outside production and renews the period of
 * the signed-in user (resets thoughtsUsed, starts a new period today). In production it answers 404.
 */
export const POST = withApiUser(async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Не найдено.", code: "NOT_FOUND" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { days?: unknown; limit?: unknown };
  const quota = await renewPeriod(ownerUserId(), {
    days: typeof body.days === "number" && body.days > 0 ? body.days : undefined,
    limit: typeof body.limit === "number" && body.limit >= 0 ? body.limit : undefined,
  });
  return NextResponse.json({ quota });
});

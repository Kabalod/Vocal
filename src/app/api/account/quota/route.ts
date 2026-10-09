import { NextResponse } from "next/server";
import { withApiUser } from "@/lib/auth/request";
import { getQuotaStatus } from "@/lib/quota";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** J1: the author's paid period and thought quota (read-only). */
export const GET = withApiUser(async function GET() {
  return NextResponse.json({ quota: await getQuotaStatus() });
});

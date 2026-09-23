import { NextResponse } from "next/server";
import { withApiUser } from "@/lib/auth/request";
import { ProfileError } from "@/lib/profile";
import { getReelContext, saveReelContext } from "@/lib/reel-context";
import { ReelError } from "@/lib/reels";
import { logApiError } from "@/lib/safe-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof ReelError || error instanceof ProfileError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  logApiError("reels/context", error);
  return NextResponse.json({ error: "Не удалось обработать контекст.", code: "INTERNAL" }, { status: 500 });
}

export const GET = withApiUser(async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const reelContext = await getReelContext(id);
    return NextResponse.json({ context: reelContext });
  } catch (error) {
    return errorResponse(error);
  }
});

export const PUT = withApiUser(async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const reelContext = await saveReelContext(id, {
      reelGoal: typeof body.reelGoal === "string" ? body.reelGoal : undefined,
      reelAudience: typeof body.reelAudience === "string" ? body.reelAudience : undefined,
      selectedKeys: body.selectedKeys,
    });
    return NextResponse.json({ context: reelContext });
  } catch (error) {
    return errorResponse(error);
  }
});

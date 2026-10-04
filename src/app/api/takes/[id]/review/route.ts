import { safeAiLog } from "@/lib/ai-runtime-context";
import { NextResponse } from "next/server";
import { withApiUser } from "@/lib/auth/request";
import { listTakeReviews, ReviewError } from "@/lib/ai/review";
import { legacyReviewGone } from "@/lib/legacy-ai-routes";
import { ReelError } from "@/lib/reels";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof ReelError || error instanceof ReviewError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error(safeAiLog({ kind: "review" }));
  return NextResponse.json({ error: "Не удалось обработать разбор." }, { status: 500 });
}

export const GET = withApiUser(async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const reviews = await listTakeReviews(id);
    return NextResponse.json({ reviews });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = withApiUser(async function POST() {
  return NextResponse.json(legacyReviewGone(), { status: 410 });
});

import { safeAiLog } from "@/lib/ai-runtime-context";
import { NextResponse } from "next/server";
import { withApiUser } from "@/lib/auth/request";
import { createReelComparison } from "@/lib/ai/compare";
import { CompareError, listComparisons, previewTextDiff } from "@/lib/compare";
import { ReelError } from "@/lib/reels";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof ReelError || error instanceof CompareError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error(safeAiLog({ kind: "compare" }));
  return NextResponse.json({ error: "Не удалось сравнить дубли." }, { status: 500 });
}

export const GET = withApiUser(async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const url = new URL(request.url);
    const leftTakeId = url.searchParams.get("leftTakeId");
    const rightTakeId = url.searchParams.get("rightTakeId");
    if (leftTakeId && rightTakeId) {
      const preview = await previewTextDiff(id, {
        leftTakeId,
        rightTakeId,
        leftTranscriptId: url.searchParams.get("leftTranscriptId"),
        rightTranscriptId: url.searchParams.get("rightTranscriptId"),
      });
      return NextResponse.json(preview);
    }
    const comparisons = await listComparisons(id);
    return NextResponse.json({ comparisons });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = withApiUser(async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const comparison = await createReelComparison(id, {
      leftTakeId: typeof body.leftTakeId === "string" ? body.leftTakeId : "",
      rightTakeId: typeof body.rightTakeId === "string" ? body.rightTakeId : "",
      leftTranscriptId: typeof body.leftTranscriptId === "string" ? body.leftTranscriptId : null,
      rightTranscriptId: typeof body.rightTranscriptId === "string" ? body.rightTranscriptId : null,
      intent: body.intent,
      runAi: body.runAi === true,
    });
    return NextResponse.json({ comparison }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});

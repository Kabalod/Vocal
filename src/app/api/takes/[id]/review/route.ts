import { safeAiLog } from "@/lib/ai-runtime-context";
import { NextResponse } from "next/server";
import { createTakeReview, listTakeReviews, ReviewError } from "@/lib/ai/review";
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

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const reviews = await listTakeReviews(id);
    return NextResponse.json({ reviews });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    let previousReviewId: string | null = null;
    try {
      const body = (await request.json()) as Record<string, unknown>;
      if (typeof body.previousReviewId === "string") previousReviewId = body.previousReviewId;
    } catch {
      previousReviewId = null;
    }
    const review = await createTakeReview(id, { previousReviewId });
    const status = review.status === "done" ? 201 : review.status === "error" ? 422 : 202;
    return NextResponse.json({ review }, { status });
  } catch (error) {
    return errorResponse(error);
  }
}

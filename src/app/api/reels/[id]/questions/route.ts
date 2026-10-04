import { safeAiLog } from "@/lib/ai-runtime-context";
import { NextResponse } from "next/server";
import { withApiUser } from "@/lib/auth/request";
import { listReelQuestions } from "@/lib/ai/questions";
import { ReviewError } from "@/lib/ai/review";
import { legacyQuestionsGone } from "@/lib/legacy-ai-routes";
import { ReelError } from "@/lib/reels";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof ReelError || error instanceof ReviewError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error(safeAiLog({ kind: "questions" }));
  return NextResponse.json({ error: "Не удалось обработать вопросы." }, { status: 500 });
}

export const GET = withApiUser(async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const questions = await listReelQuestions(id);
    return NextResponse.json({ questions });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = withApiUser(async function POST() {
  return NextResponse.json(legacyQuestionsGone(), { status: 410 });
});

import { safeAiLog } from "@/lib/ai-runtime-context";
import { NextResponse } from "next/server";
import { authErrorResponse, bindApiUser } from "@/lib/auth/request";
import { continueQuestions, listReelQuestions } from "@/lib/ai/questions";
import { ReviewError } from "@/lib/ai/review";
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

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { await bindApiUser(); } catch (error) { const denied = authErrorResponse(error); if (denied) return denied; throw error; }
  try {
    const { id } = await context.params;
    const questions = await listReelQuestions(id);
    return NextResponse.json({ questions });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { await bindApiUser(); } catch (error) { const denied = authErrorResponse(error); if (denied) return denied; throw error; }
  try {
    const { id } = await context.params;
    let takeId: string | null = null;
    try {
      const body = (await request.json()) as Record<string, unknown>;
      if (typeof body.takeId === "string") takeId = body.takeId;
    } catch {
      takeId = null;
    }
    const questions = await continueQuestions(id, { takeId });
    return NextResponse.json({ questions }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

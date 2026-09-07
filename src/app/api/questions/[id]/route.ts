import { NextResponse } from "next/server";
import { updateQuestion } from "@/lib/ai/questions";
import { ReviewError } from "@/lib/ai/review";
import { ReelError } from "@/lib/reels";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof ReelError || error instanceof ReviewError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error(error);
  return NextResponse.json({ error: "Не удалось сохранить ответ." }, { status: 500 });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const question = await updateQuestion(id, {
      text: typeof body.text === "string" ? body.text : undefined,
      status: typeof body.status === "string" ? body.status : undefined,
    });
    return NextResponse.json({ question });
  } catch (error) {
    return errorResponse(error);
  }
}

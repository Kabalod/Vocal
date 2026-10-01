import { safeAiLog } from "@/lib/ai-runtime-context";
import { NextResponse } from "next/server";
import { withApiUser } from "@/lib/auth/request";
import { AiBudgetError, AiInflightError } from "@/lib/ai/usage-guard";
import { ReelError } from "@/lib/reels";
import { ScriptError } from "@/lib/scripts";
import { generateV05Script, ScriptReadinessError } from "@/lib/v05-script";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof ScriptReadinessError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        blockReason: error.blockReason,
        nextQuestion: error.nextQuestion,
      },
      { status: error.status },
    );
  }
  if (
    error instanceof ReelError ||
    error instanceof ScriptError ||
    error instanceof AiBudgetError ||
    error instanceof AiInflightError
  ) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error(safeAiLog({ kind: "script" }));
  return NextResponse.json({ error: "Не удалось собрать сценарий." }, { status: 500 });
}

export const POST = withApiUser(async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    let idempotencyKey = "";
    try {
      const body = (await request.json()) as Record<string, unknown>;
      if (typeof body.idempotencyKey === "string") idempotencyKey = body.idempotencyKey;
    } catch {
      idempotencyKey = "";
    }
    const workspace = await generateV05Script(id, { idempotencyKey });
    return NextResponse.json(workspace, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});

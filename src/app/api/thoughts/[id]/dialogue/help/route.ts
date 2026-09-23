import { safeAiLog } from "@/lib/ai-runtime-context";
import { NextResponse } from "next/server";
import { withApiUser } from "@/lib/auth/request";
import { AiBudgetError } from "@/lib/ai/usage-guard";
import { DialogueError, requestScriptHelp } from "@/lib/dialogue";
import { ReelError } from "@/lib/reels";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withApiUser(async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { idempotencyKey?: string };
    const page = await requestScriptHelp(id, { idempotencyKey: body.idempotencyKey ?? "" });
    return NextResponse.json(page, { status: 201 });
  } catch (error) {
    if (error instanceof ReelError || error instanceof DialogueError || error instanceof AiBudgetError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error(safeAiLog({ kind: "dialogue-help" }));
    return NextResponse.json({ error: "Не удалось попросить помощь со сценарием." }, { status: 500 });
  }
});

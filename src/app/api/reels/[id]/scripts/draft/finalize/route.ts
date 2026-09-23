import { NextResponse } from "next/server";
import { withApiUser } from "@/lib/auth/request";
import { ReelError } from "@/lib/reels";
import { logApiError } from "@/lib/safe-log";
import { finalizeScriptDraft, ScriptError } from "@/lib/scripts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withApiUser(async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      expectedUpdatedAt?: string;
      expectedSaveToken?: number;
      body?: string;
    };
    if (typeof body.expectedUpdatedAt !== "string") {
      return NextResponse.json({ error: "Нужна метка черновика.", code: "DRAFT_REQUIRED" }, { status: 400 });
    }
    const workspace = await finalizeScriptDraft(id, {
      expectedUpdatedAt: body.expectedUpdatedAt,
      expectedSaveToken: typeof body.expectedSaveToken === "number" ? body.expectedSaveToken : undefined,
      body: typeof body.body === "string" ? body.body : undefined,
    });
    return NextResponse.json(workspace, { status: 201 });
  } catch (error) {
    if (error instanceof ReelError || error instanceof ScriptError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    logApiError("reels/scripts/draft/finalize", error);
    return NextResponse.json({ error: "Не удалось завершить версию.", code: "INTERNAL" }, { status: 500 });
  }
});

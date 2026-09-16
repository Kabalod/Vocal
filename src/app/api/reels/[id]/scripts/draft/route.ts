import { NextResponse } from "next/server";
import { ReelError } from "@/lib/reels";
import { logApiError } from "@/lib/safe-log";
import { deleteScriptDraft, openScriptDraft, parseSourceRefs, patchScriptDraft, ScriptError } from "@/lib/scripts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof ReelError || error instanceof ScriptError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  logApiError("reels/scripts/draft", error);
  return NextResponse.json({ error: "Не удалось обработать черновик.", code: "INTERNAL" }, { status: 500 });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    let baseVersionId: string | null | undefined;
    try {
      const body = (await request.json()) as { baseVersionId?: string | null };
      baseVersionId = body.baseVersionId;
    } catch {
      baseVersionId = undefined;
    }
    const workspace = await openScriptDraft(id, baseVersionId);
    return NextResponse.json(workspace, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.body !== "string" || typeof body.expectedUpdatedAt !== "string") {
      return NextResponse.json({ error: "Нужны текст и метка черновика.", code: "DRAFT_REQUIRED" }, { status: 400 });
    }
    const workspace = await patchScriptDraft(id, {
      body: body.body,
      expectedUpdatedAt: body.expectedUpdatedAt,
      expectedSaveToken: typeof body.expectedSaveToken === "number" ? body.expectedSaveToken : undefined,
      sources: parseSourceRefs(body.sources),
    });
    return NextResponse.json(workspace);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const workspace = await deleteScriptDraft(id);
    return NextResponse.json(workspace);
  } catch (error) {
    return errorResponse(error);
  }
}

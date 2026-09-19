import { safeAiLog } from "@/lib/ai-runtime-context";
import { NextResponse } from "next/server";
import { authErrorResponse, bindApiUser } from "@/lib/auth/request";
import { generateScriptProposal } from "@/lib/ai/script";
import { ReelError } from "@/lib/reels";
import { ScriptError } from "@/lib/scripts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof ReelError || error instanceof ScriptError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error(safeAiLog({ kind: "script" }));
  return NextResponse.json({ error: "Не удалось собрать сценарий." }, { status: 500 });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { await bindApiUser(); } catch (error) { const denied = authErrorResponse(error); if (denied) return denied; throw error; }
  try {
    const { id } = await context.params;
    let sources: unknown = [];
    try {
      const body = (await request.json()) as Record<string, unknown>;
      sources = body.sources;
    } catch {
      sources = [];
    }
    const result = await generateScriptProposal(id, { sources });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

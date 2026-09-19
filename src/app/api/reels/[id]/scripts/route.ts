import { NextResponse } from "next/server";
import { authErrorResponse, bindApiUser } from "@/lib/auth/request";
import { ReelError } from "@/lib/reels";
import { logApiError } from "@/lib/safe-log";
import {
  acceptScriptProposal,
  listScriptWorkspace,
  parseSourceRefs,
  restoreScript,
  saveManualScript,
  setFinalScript,
  ScriptError,
} from "@/lib/scripts";
import { emptyRecording } from "@/types/script";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof ReelError || error instanceof ScriptError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  logApiError("reels/scripts", error);
  return NextResponse.json({ error: "Не удалось обработать сценарий.", code: "INTERNAL" }, { status: 500 });
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try { await bindApiUser(); } catch (error) { const denied = authErrorResponse(error); if (denied) return denied; throw error; }
  try {
    const { id } = await context.params;
    const view = new URL(request.url).searchParams.get("view");
    const workspace = await listScriptWorkspace(id, view);
    return NextResponse.json(workspace);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { await bindApiUser(); } catch (error) { const denied = authErrorResponse(error); if (denied) return denied; throw error; }
  try {
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "save";
    const expectedHeadId =
      body.expectedHeadId === null ? null : typeof body.expectedHeadId === "string" ? body.expectedHeadId : undefined;

    if (action === "restore") {
      if (typeof body.scriptId !== "string") {
        return NextResponse.json({ error: "Нужна версия для восстановления.", code: "SCRIPT_REQUIRED" }, { status: 400 });
      }
      const bundle = await restoreScript(id, body.scriptId, expectedHeadId);
      return NextResponse.json(bundle, { status: 201 });
    }
    if (action === "final") {
      const scriptId = body.scriptId === null ? null : typeof body.scriptId === "string" ? body.scriptId : null;
      const bundle = await setFinalScript(id, scriptId);
      return NextResponse.json(bundle);
    }
    if (action === "accept") {
      if (typeof body.proposalId !== "string") {
        return NextResponse.json({ error: "Нужно предложение модели.", code: "PROPOSAL_REQUIRED" }, { status: 400 });
      }
      const bundle = await acceptScriptProposal(id, body.proposalId, expectedHeadId);
      return NextResponse.json(bundle, { status: 201 });
    }

    const recording = body.recording && typeof body.recording === "object" ? body.recording : emptyRecording();
    const bundle = await saveManualScript(id, {
      body: typeof body.body === "string" ? body.body : "",
      recording: recording as { opening?: string; supports?: string; example?: string; ending?: string },
      sources: parseSourceRefs(body.sources),
      expectedHeadId,
    });
    return NextResponse.json(bundle, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

import { NextResponse } from "next/server";
import { ReelError } from "@/lib/reels";
import { logApiError } from "@/lib/safe-log";
import { getScriptVersion, ScriptError } from "@/lib/scripts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string; scriptId: string }> }) {
  try {
    const { id, scriptId } = await context.params;
    const version = await getScriptVersion(id, scriptId);
    return NextResponse.json(version);
  } catch (error) {
    if (error instanceof ReelError || error instanceof ScriptError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    logApiError("reels/scripts/[scriptId]", error);
    return NextResponse.json({ error: "Не удалось загрузить версию сценария.", code: "INTERNAL" }, { status: 500 });
  }
}

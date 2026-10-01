import { NextResponse } from "next/server";
import { withApiUser } from "@/lib/auth/request";
import { ReelError } from "@/lib/reels";
import { ScriptError } from "@/lib/scripts";
import { keepCurrentScript } from "@/lib/v05-script";
import { logApiError } from "@/lib/safe-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withApiUser(async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const workspace = await keepCurrentScript(id);
    return NextResponse.json(workspace);
  } catch (error) {
    if (error instanceof ReelError || error instanceof ScriptError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    logApiError("reels/scripts/keep", error);
    return NextResponse.json({ error: "Не удалось оставить сценарий.", code: "INTERNAL" }, { status: 500 });
  }
});

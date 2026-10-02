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
    let versionId: string | null | undefined;
    let draft = false;
    let draftId: string | undefined;
    let expectedSaveToken: number | undefined;
    try {
      const body = (await _request.json()) as {
        versionId?: unknown;
        draft?: unknown;
        draftId?: unknown;
        expectedSaveToken?: unknown;
      };
      if (typeof body.versionId === "string") versionId = body.versionId;
      if (body.draft === true) draft = true;
      if (typeof body.draftId === "string") draftId = body.draftId;
      if (typeof body.expectedSaveToken === "number") expectedSaveToken = body.expectedSaveToken;
    } catch {
      versionId = undefined;
    }
    const workspace = await keepCurrentScript(id, { versionId, draft, draftId, expectedSaveToken });
    return NextResponse.json(workspace);
  } catch (error) {
    if (error instanceof ReelError || error instanceof ScriptError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    logApiError("reels/scripts/keep", error);
    return NextResponse.json({ error: "Не удалось оставить сценарий.", code: "INTERNAL" }, { status: 500 });
  }
});

import { NextResponse } from "next/server";
import { withApiUser } from "@/lib/auth/request";
import { DialogueError, transferDialogueProposal } from "@/lib/dialogue";
import { ReelError } from "@/lib/reels";
import { logApiError } from "@/lib/safe-log";
import { ScriptError } from "@/lib/scripts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withApiUser(async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { messageId?: string };
    if (!body.messageId) {
      return NextResponse.json({ error: "Нужно предложение.", code: "PROPOSAL_REQUIRED" }, { status: 400 });
    }
    await transferDialogueProposal(id, body.messageId);
  } catch (error) {
    if (error instanceof ReelError || error instanceof DialogueError || error instanceof ScriptError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    logApiError("thoughts/dialogue/transfer", error);
  }
  return NextResponse.json({ error: "Перенос предложения из диалога закрыт.", code: "GONE" }, { status: 410 });
});

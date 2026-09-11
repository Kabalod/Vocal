import { NextResponse } from "next/server";
import { DialogueError, transferDialogueProposal } from "@/lib/dialogue";
import { ReelError } from "@/lib/reels";
import { ScriptError } from "@/lib/scripts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { messageId?: string };
    if (!body.messageId) {
      return NextResponse.json({ error: "Нужно предложение.", code: "PROPOSAL_REQUIRED" }, { status: 400 });
    }
    const page = await transferDialogueProposal(id, body.messageId);
    return NextResponse.json(page);
  } catch (error) {
    if (error instanceof ReelError || error instanceof DialogueError || error instanceof ScriptError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Не удалось перенести предложение." }, { status: 500 });
  }
}

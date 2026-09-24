import { safeAiLog } from "@/lib/ai-runtime-context";
import { NextResponse } from "next/server";
import { withApiUser } from "@/lib/auth/request";
import { AiBudgetError, AiInflightError, StateVersionError } from "@/lib/ai/usage-guard";
import { DialogueError, listDialoguePage, sendDialogueMessage, sendDialogueVoice } from "@/lib/dialogue";
import { ReelError } from "@/lib/reels";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (
    error instanceof ReelError ||
    error instanceof DialogueError ||
    error instanceof AiBudgetError ||
    error instanceof AiInflightError ||
    error instanceof StateVersionError
  ) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error(safeAiLog({ kind: "dialogue" }));
  return NextResponse.json({ error: "Не удалось обработать диалог." }, { status: 500 });
}

export const GET = withApiUser(async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const cursor = new URL(request.url).searchParams.get("cursor");
    const page = await listDialoguePage(id, { cursor });
    return NextResponse.json(page);
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = withApiUser(async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File) || file.size === 0) {
        return NextResponse.json({ error: "Нужен голосовой файл.", code: "VOICE_REQUIRED" }, { status: 400 });
      }
      const page = await sendDialogueVoice(id, {
        file,
        idempotencyKey: String(form.get("idempotencyKey") ?? ""),
        voiceDurationLabel: String(form.get("voiceDurationLabel") ?? "") || undefined,
        expectedUpdatedAt: String(form.get("expectedUpdatedAt") ?? "") || undefined,
        expectedWorkingTakeId: String(form.get("expectedWorkingTakeId") ?? "") || undefined,
      });
      return NextResponse.json(page, { status: 201 });
    }
    const body = (await request.json()) as {
      text?: string;
      idempotencyKey?: string;
      voiceDurationLabel?: string;
      expectedUpdatedAt?: string;
      expectedWorkingTakeId?: string;
    };
    const page = await sendDialogueMessage(id, {
      text: body.text ?? "",
      idempotencyKey: body.idempotencyKey ?? "",
      voiceDurationLabel: body.voiceDurationLabel,
      expectedUpdatedAt: body.expectedUpdatedAt,
      expectedWorkingTakeId: body.expectedWorkingTakeId,
    });
    return NextResponse.json(page, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});

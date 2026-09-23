import { safeAiLog } from "@/lib/ai-runtime-context";
import { NextResponse } from "next/server";
import { withApiUser } from "@/lib/auth/request";
import { AiBudgetError } from "@/lib/ai/usage-guard";
import { ProfileError } from "@/lib/profile";
import {
  ProfileDialogueError,
  getProfileWorkspace,
  sendProfileMessage,
  sendProfileVoice,
  skipProfileDialogue,
  startProfileDialogue,
  supplementProfileDialogue,
  confirmProfilePortrait,
} from "@/lib/profile-dialogue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof ProfileDialogueError || error instanceof ProfileError || error instanceof AiBudgetError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error(safeAiLog({ kind: "profile-dialogue" }));
  return NextResponse.json({ error: "Не удалось обработать анкету." }, { status: 500 });
}

export const GET = withApiUser(async function GET(request: Request) {
  try {
    const cursor = new URL(request.url).searchParams.get("cursor");
    const workspace = await getProfileWorkspace({ cursor });
    return NextResponse.json(workspace);
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = withApiUser(async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File) || file.size === 0) {
        return NextResponse.json({ error: "Нужен голосовой файл.", code: "VOICE_REQUIRED" }, { status: 400 });
      }
      const workspace = await sendProfileVoice({
        file,
        idempotencyKey: String(form.get("idempotencyKey") ?? ""),
        voiceDurationLabel: String(form.get("voiceDurationLabel") ?? "") || undefined,
      });
      return NextResponse.json(workspace, { status: 201 });
    }
    const body = (await request.json()) as {
      action?: string;
      text?: string;
      idempotencyKey?: string;
      voiceDurationLabel?: string;
    };
    if (body.action === "start") {
      return NextResponse.json(await startProfileDialogue());
    }
    if (body.action === "skip") {
      return NextResponse.json(await skipProfileDialogue());
    }
    if (body.action === "supplement") {
      return NextResponse.json(await supplementProfileDialogue());
    }
    if (body.action === "confirm") {
      return NextResponse.json(await confirmProfilePortrait());
    }
    const workspace = await sendProfileMessage({
      text: body.text ?? "",
      idempotencyKey: body.idempotencyKey ?? "",
      voiceDurationLabel: body.voiceDurationLabel,
    });
    return NextResponse.json(workspace, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});

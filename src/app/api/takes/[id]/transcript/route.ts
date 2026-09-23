import { NextResponse } from "next/server";
import { withApiUser } from "@/lib/auth/request";
import { ReelError } from "@/lib/reels";
import { logApiError } from "@/lib/safe-log";
import {
  createEditedRevision,
  listTranscriptBundle,
  selectTranscriptRevision,
} from "@/lib/transcripts";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof ReelError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  logApiError("takes/transcript", error);
  return NextResponse.json({ error: "Не удалось обработать расшифровку.", code: "INTERNAL" }, { status: 500 });
}

export const GET = withApiUser(async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const transcript = await listTranscriptBundle(id);
    return NextResponse.json({ transcript });
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = withApiUser(async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const text = typeof body.text === "string" ? body.text : "";
    const transcript = await createEditedRevision(id, text);
    return NextResponse.json({ transcript }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});

export const PATCH = withApiUser(async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const selectedId = typeof body.selectedId === "string" ? body.selectedId : "";
    if (!selectedId) {
      return NextResponse.json({ error: "Укажите версию.", code: "REVISION_REQUIRED" }, { status: 400 });
    }
    const transcript = await selectTranscriptRevision(id, selectedId);
    return NextResponse.json({ transcript });
  } catch (error) {
    return errorResponse(error);
  }
});

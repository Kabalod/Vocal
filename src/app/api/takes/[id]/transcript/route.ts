import { NextResponse } from "next/server";
import { ReelError } from "@/lib/reels";
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
  console.error(error);
  return NextResponse.json({ error: "Не удалось обработать расшифровку." }, { status: 500 });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const transcript = await listTranscriptBundle(id);
    return NextResponse.json({ transcript });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const text = typeof body.text === "string" ? body.text : "";
    const transcript = await createEditedRevision(id, text);
    return NextResponse.json({ transcript }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
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
}

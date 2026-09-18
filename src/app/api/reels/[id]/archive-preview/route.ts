import { NextResponse } from "next/server";
import { getArchiveThoughtPreview } from "@/lib/archive-preview";
import { ReelError } from "@/lib/reels";
import { logApiError } from "@/lib/safe-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof ReelError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  logApiError("reels/archive-preview", error);
  return NextResponse.json({ error: "Не удалось открыть превью.", code: "INTERNAL" }, { status: 500 });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const preview = await getArchiveThoughtPreview(id);
    return NextResponse.json(preview);
  } catch (error) {
    return errorResponse(error);
  }
}

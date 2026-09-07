import { NextResponse } from "next/server";
import { exportReel } from "@/lib/export-reel";
import { ReelError } from "@/lib/reels";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const url = new URL(request.url);
    const includeHiddenContext = url.searchParams.get("includeHiddenContext") === "1";
    const payload = await exportReel(id, { includeHiddenContext });
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof ReelError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Не удалось экспортировать карточку." }, { status: 500 });
  }
}

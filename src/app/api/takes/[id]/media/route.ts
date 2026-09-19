import { NextResponse } from "next/server";
import { authErrorResponse, bindApiUser } from "@/lib/auth/request";
import { mediaFileResponse } from "@/lib/take-media";
import { resolveTakeFilePath } from "@/lib/takes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try { await bindApiUser(); } catch (error) { const denied = authErrorResponse(error); if (denied) return denied; throw error; }
  const { id } = await context.params;
  const file = await resolveTakeFilePath(id);
  if (!file) {
    return NextResponse.json({ error: "Файл дубля не найден.", code: "MEDIA_NOT_FOUND" }, { status: 404 });
  }
  try {
    const url = new URL(request.url);
    return await mediaFileResponse({
      storedPath: file.storedPath,
      originalName: file.originalName,
      mimeType: file.mimeType,
      request,
      download: url.searchParams.get("download") === "1",
    });
  } catch {
    return NextResponse.json({ error: "Файл недоступен.", code: "MEDIA_DENIED" }, { status: 404 });
  }
}

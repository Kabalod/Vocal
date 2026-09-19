import { NextResponse } from "next/server";
import { authErrorResponse, bindApiUser } from "@/lib/auth/request";
import { ReelError } from "@/lib/reels";
import { logApiError } from "@/lib/safe-log";
import { getTakeDto, updateTake } from "@/lib/takes";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof ReelError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  logApiError("takes/[id]", error);
  return NextResponse.json({ error: "Не удалось обработать дубль.", code: "INTERNAL" }, { status: 500 });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { await bindApiUser(); } catch (error) { const denied = authErrorResponse(error); if (denied) return denied; throw error; }
  const { id } = await context.params;
  const take = await getTakeDto(id);
  if (!take) {
    return NextResponse.json({ error: "Дубль не найден.", code: "TAKE_NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json({ take });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try { await bindApiUser(); } catch (error) { const denied = authErrorResponse(error); if (denied) return denied; throw error; }
  const { id } = await context.params;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if ("storedPath" in body || "videoPath" in body || "mediaPath" in body) {
      return NextResponse.json({ error: "Путь к файлу задаёт только сервер.", code: "PATH_NOT_ALLOWED" }, { status: 400 });
    }
    const take = await updateTake(id, {
      authorNote: typeof body.authorNote === "string" ? body.authorNote : undefined,
      bodyText: typeof body.bodyText === "string" ? body.bodyText : undefined,
      scriptVersionId:
        body.scriptVersionId === null
          ? null
          : typeof body.scriptVersionId === "string"
            ? body.scriptVersionId
            : undefined,
    });
    return NextResponse.json({ take });
  } catch (error) {
    return errorResponse(error);
  }
}

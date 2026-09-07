import { NextResponse } from "next/server";
import { ReelError, createTake, getReel } from "@/lib/reels";
import { getTakeDto, listTakeDtos } from "@/lib/takes";
import { isTakeInputType } from "@/types/reel";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof ReelError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error(error);
  return NextResponse.json({ error: "Не удалось обработать дубль." }, { status: 500 });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const takes = await listTakeDtos(id);
    return NextResponse.json({ takes });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const reel = await getReel(id);
    if (!reel) {
      return NextResponse.json({ error: "Карточка не найдена.", code: "REEL_NOT_FOUND" }, { status: 404 });
    }
    const body = (await request.json()) as Record<string, unknown>;
    const inputType = typeof body.inputType === "string" ? body.inputType : "";
    if (!isTakeInputType(inputType) || inputType !== "text") {
      return NextResponse.json(
        { error: "С этого экрана текстом создаётся только текстовая попытка. Файл — через загрузку.", code: "INPUT_TYPE" },
        { status: 400 },
      );
    }
    if ("storedPath" in body || "videoPath" in body || "mediaPath" in body) {
      return NextResponse.json({ error: "Путь к файлу задаёт только сервер.", code: "PATH_NOT_ALLOWED" }, { status: 400 });
    }
    const bodyText = typeof body.bodyText === "string" ? body.bodyText : "";
    if (!bodyText.trim()) {
      return NextResponse.json({ error: "Введите текст попытки.", code: "TEXT_REQUIRED" }, { status: 400 });
    }
    const created = await createTake(id, {
      inputType: "text",
      authorNote: typeof body.authorNote === "string" ? body.authorNote : "",
      bodyText,
      idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
      scriptVersionId: typeof body.scriptVersionId === "string" ? body.scriptVersionId : undefined,
    });
    const { ensureOriginalFromText } = await import("@/lib/transcripts");
    await ensureOriginalFromText(created.id, bodyText);
    const take = await getTakeDto(created.id);
    return NextResponse.json({ take, selectedTakeId: reel.selectedTakeId }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

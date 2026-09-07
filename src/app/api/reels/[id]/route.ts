import { NextResponse } from "next/server";
import { ReelError, getReel, updateReel } from "@/lib/reels";
import { parseReelStatusInput, type UpdateReelInput } from "@/types/reel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof ReelError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error(error);
  return NextResponse.json({ error: "Не удалось обработать запрос." }, { status: 500 });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const reel = await getReel(id);
    if (!reel) {
      return NextResponse.json({ error: "Карточка не найдена.", code: "REEL_NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ reel });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const input: UpdateReelInput = {};
    if ("title" in body) {
      if (typeof body.title !== "string") {
        return NextResponse.json({ error: "Название должно быть текстом.", code: "TITLE_REQUIRED" }, { status: 400 });
      }
      input.title = body.title;
    }
    if ("initialNote" in body) {
      if (typeof body.initialNote !== "string") {
        return NextResponse.json({ error: "Заметка должна быть текстом.", code: "NOTE_TYPE" }, { status: 400 });
      }
      input.initialNote = body.initialNote;
    }
    if ("status" in body) {
      if (typeof body.status !== "string") {
        return NextResponse.json({ error: "Неизвестный статус карточки.", code: "REEL_STATUS" }, { status: 400 });
      }
      const status = parseReelStatusInput(body.status);
      if (!status) {
        return NextResponse.json({ error: "Неизвестный статус карточки.", code: "REEL_STATUS" }, { status: 400 });
      }
      input.status = status;
    }
    if ("selectedTakeId" in body) {
      if (body.selectedTakeId !== null && typeof body.selectedTakeId !== "string") {
        return NextResponse.json(
          { error: "Финальный дубль должен принадлежать этой карточке.", code: "TAKE_NOT_IN_REEL" },
          { status: 400 },
        );
      }
      input.selectedTakeId = body.selectedTakeId as string | null;
    }
    if ("expectedUpdatedAt" in body) {
      if (typeof body.expectedUpdatedAt !== "string") {
        return NextResponse.json({ error: "Некорректная версия карточки.", code: "STALE" }, { status: 400 });
      }
      input.expectedUpdatedAt = body.expectedUpdatedAt;
    }
    if (Object.keys(input).length === 0) {
      return NextResponse.json({ error: "Нет полей для сохранения.", code: "EMPTY_PATCH" }, { status: 400 });
    }
    const reel = await updateReel(id, input);
    return NextResponse.json({ reel });
  } catch (error) {
    return errorResponse(error);
  }
}

import { NextResponse } from "next/server";
import { withApiUser } from "@/lib/auth/request";
import { normalizeArchiveListSort } from "@/lib/reel-archive-query";
import { ReelError, createReel, listReels } from "@/lib/reels";
import { logApiError } from "@/lib/safe-log";
import { parseReelStatusInput, type ReelListQuery } from "@/types/reel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof ReelError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  logApiError("reels", error);
  return NextResponse.json({ error: "Не удалось обработать запрос.", code: "INTERNAL" }, { status: 500 });
}

export const GET = withApiUser(async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? undefined;
    const statusRaw = url.searchParams.get("status") ?? "open";
    const sortRaw = url.searchParams.get("sort") ?? "newest";
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
    const from = url.searchParams.get("from") ?? undefined;
    const to = url.searchParams.get("to") ?? undefined;
    const dateFieldRaw = url.searchParams.get("dateField");
    const dateField = dateFieldRaw === null || dateFieldRaw === "" ? undefined : dateFieldRaw;
    const sort = normalizeArchiveListSort(sortRaw);
    let status: ReelListQuery["status"] = "open";
    if (statusRaw === "all" || statusRaw === "open") status = statusRaw;
    else {
      const parsed = parseReelStatusInput(statusRaw);
      if (!parsed) {
        return NextResponse.json({ error: "Неизвестный фильтр статуса.", code: "REEL_STATUS" }, { status: 400 });
      }
      status = parsed;
    }
    const result = await listReels({
      q,
      status,
      sort,
      cursor,
      limit: Number.isFinite(limit) ? limit : undefined,
      from,
      to,
      dateField,
    });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = withApiUser(async function POST(request: Request) {
  try {
    const body = (await request.json()) as { title?: unknown; initialNote?: unknown };
    if (typeof body.title !== "string") {
      return NextResponse.json({ error: "Нужно название карточки.", code: "TITLE_REQUIRED" }, { status: 400 });
    }
    const reel = await createReel({
      title: body.title,
      initialNote: typeof body.initialNote === "string" ? body.initialNote : "",
    });
    return NextResponse.json({ reel }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});

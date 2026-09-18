import { NextResponse } from "next/server";
import { ReelError, listReelCalendarFacets } from "@/lib/reels";
import { logApiError } from "@/lib/safe-log";
import { parseReelStatusInput, type ReelListQuery } from "@/types/reel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof ReelError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  logApiError("reels/calendar", error);
  return NextResponse.json({ error: "Не удалось загрузить календарь.", code: "INTERNAL" }, { status: 500 });
}

/**
 * Compact month facets for the thoughts archive.
 * Marks days that have thoughts under the same search/status filters as the list,
 * without loading list cards. Date field default is createdAt (P01.1).
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const month = url.searchParams.get("month");
    if (!month) {
      return NextResponse.json({ error: "Нужен месяц YYYY-MM.", code: "CALENDAR_MONTH" }, { status: 400 });
    }
    const timeZone = url.searchParams.get("timeZone") ?? undefined;
    const tzRaw = url.searchParams.get("tzOffsetMinutes");
    const tzOffsetMinutes = tzRaw == null || tzRaw === "" ? undefined : Number.parseInt(tzRaw, 10);
    if (tzOffsetMinutes !== undefined && !Number.isFinite(tzOffsetMinutes)) {
      return NextResponse.json({ error: "Некорректный tzOffsetMinutes.", code: "CALENDAR_TZ" }, { status: 400 });
    }
    if (!timeZone && tzOffsetMinutes === undefined) {
      return NextResponse.json({ error: "Нужен timeZone или tzOffsetMinutes.", code: "CALENDAR_TZ" }, { status: 400 });
    }

    const q = url.searchParams.get("q") ?? undefined;
    const statusRaw = url.searchParams.get("status") ?? "open";
    const dateField = url.searchParams.get("dateField") ?? undefined;
    let status: ReelListQuery["status"] = "open";
    if (statusRaw === "all" || statusRaw === "open") status = statusRaw;
    else {
      const parsed = parseReelStatusInput(statusRaw);
      if (!parsed) {
        return NextResponse.json({ error: "Неизвестный фильтр статуса.", code: "REEL_STATUS" }, { status: 400 });
      }
      status = parsed;
    }

    const facets = await listReelCalendarFacets({
      month,
      tzOffsetMinutes,
      timeZone,
      q,
      status,
      dateField,
    });
    return NextResponse.json(facets);
  } catch (error) {
    return errorResponse(error);
  }
}

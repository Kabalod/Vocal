import { NextResponse } from "next/server";
import { withApiUser } from "@/lib/auth/request";
import { quotaErrorResponse } from "@/lib/quota-http";
import { ReelError } from "@/lib/reels";
import { logApiError } from "@/lib/safe-log";
import { createThoughtFromMedia } from "@/lib/thought-media";
import { isTakeInputType } from "@/types/reel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(error: unknown) {
  const quota = quotaErrorResponse(error);
  if (quota) return quota;
  if (error instanceof ReelError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  logApiError("thoughts/media", error);
  return NextResponse.json({ error: "Не удалось сохранить материал.", code: "INTERNAL" }, { status: 500 });
}

export const POST = withApiUser(async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Выберите файл." }, { status: 400 });
    }
    const inputTypeRaw = String(form.get("inputType") ?? "video");
    const inputType = isTakeInputType(inputTypeRaw) ? inputTypeRaw : "video";
    const result = await createThoughtFromMedia({
      file,
      inputType,
      idempotencyKey:
        request.headers.get("idempotency-key")?.trim() ||
        (typeof form.get("idempotencyKey") === "string" ? String(form.get("idempotencyKey")) : ""),
    });
    return NextResponse.json(
      { reel: result.reel, take: result.take, job: result.job },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    return errorResponse(error);
  }
});

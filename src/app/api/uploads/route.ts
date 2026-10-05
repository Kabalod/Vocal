import { NextResponse } from "next/server";
import { withApiUser } from "@/lib/auth/request";
import { enqueueJob } from "@/lib/pipeline";
import { ensureStorageDirs } from "@/lib/storage";
import { ReelError } from "@/lib/reels";
import { saveUploadedTake } from "@/lib/takes";
import { logApiError } from "@/lib/safe-log";
import { canProcessSavedTake } from "@/lib/recording-session";
import { isTakeInputType } from "@/types/reel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withApiUser(async function POST(request: Request) {
  try {
    await ensureStorageDirs();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Выберите файл." }, { status: 400 });
    }

    const reelId = typeof form.get("reelId") === "string" ? String(form.get("reelId")).trim() : "";
    if (reelId) {
      const inputTypeRaw = String(form.get("inputType") ?? "video");
      const inputType = isTakeInputType(inputTypeRaw) ? inputTypeRaw : "video";
      const scriptVersionId =
        typeof form.get("scriptVersionId") === "string" ? String(form.get("scriptVersionId")).trim() : "";
      const shouldProcess = String(form.get("process") ?? "") === "1";
      const take = await saveUploadedTake({
        reelId,
        file,
        inputType: inputType === "audio" ? "audio" : "video",
        authorNote: typeof form.get("authorNote") === "string" ? String(form.get("authorNote")) : "",
        idempotencyKey:
          request.headers.get("idempotency-key")?.trim() ||
          (typeof form.get("idempotencyKey") === "string" ? String(form.get("idempotencyKey")).trim() : undefined),
        scriptVersionId: scriptVersionId || undefined,
      });
      let job = null;
      if (shouldProcess && canProcessSavedTake(take)) {
        const { ensureJobForTake } = await import("@/lib/thought-media");
        job = await ensureJobForTake(take.id, file.name);
        enqueueJob(job.id);
      }
      return NextResponse.json({ take, job }, { status: 201 });
    }

    // A bare upload used to create a thought outside ThoughtCreateKey. New thoughts come from
    // POST /api/thoughts or /api/thoughts/media; a take needs an existing thought (reelId).
    return NextResponse.json(
      { error: "Загрузка без мысли закрыта. Создайте мысль или откройте существующую.", code: "GONE" },
      { status: 410 },
    );
  } catch (error) {
    if (error instanceof ReelError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    logApiError("uploads", error);
    return NextResponse.json(
      { error: "Не удалось загрузить файл.", code: "INTERNAL" },
      { status: 500 },
    );
  }
});

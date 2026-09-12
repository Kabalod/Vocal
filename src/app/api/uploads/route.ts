import { after, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";
import { ALLOWED_EXTENSIONS, MAX_UPLOAD_MB } from "@/lib/config";
import { ensureCriteria, prisma } from "@/lib/db";
import { enqueueJob } from "@/lib/pipeline";
import { ReelError, createReel, createTake } from "@/lib/reels";
import { toJobDto } from "@/lib/serialize";
import { ensureStorageDirs, videoPathFor } from "@/lib/storage";
import { saveUploadedTake } from "@/lib/takes";
import { isTakeInputType } from "@/types/reel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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
      const take = await saveUploadedTake({
        reelId,
        file,
        inputType: inputType === "audio" ? "audio" : "video",
        authorNote: typeof form.get("authorNote") === "string" ? String(form.get("authorNote")) : "",
        idempotencyKey:
          request.headers.get("idempotency-key")?.trim() ||
          (typeof form.get("idempotencyKey") === "string" ? String(form.get("idempotencyKey")).trim() : undefined),
        scriptVersionId:
          typeof form.get("scriptVersionId") === "string" ? String(form.get("scriptVersionId")).trim() : undefined,
      });
      const shouldProcess = String(form.get("process") ?? "") === "1";
      if (shouldProcess && take.mediaStatus === "ready" && take.hasFile) {
        const { ensureJobForTake } = await import("@/lib/thought-media");
        const job = await ensureJobForTake(take.id, file.name);
        enqueueJob(job.id);
      }
      return NextResponse.json({ take }, { status: 201 });
    }

    await ensureCriteria();
    const ext = path.extname(file.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { error: "Нужен файл mp4, webm, mov или mkv." },
        { status: 400 },
      );
    }

    const maxBytes = MAX_UPLOAD_MB * 1024 * 1024;
    if (file.size > maxBytes) {
      return NextResponse.json(
        { error: `Файл больше ${MAX_UPLOAD_MB} МБ.` },
        { status: 400 },
      );
    }

    const job = await prisma.job.create({
      data: {
        originalName: file.name,
        videoPath: "pending",
        status: "queued",
      },
    });

    const dest = videoPathFor(job.id, file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(dest, buffer);

    const updated = await prisma.job.update({
      where: { id: job.id },
      data: { videoPath: dest },
    });

    const title = path.parse(file.name).name.trim() || "Ролик без названия";
    const reel = await createReel({ title });
    await createTake(reel.id, { inputType: "video", jobId: job.id });

    after(() => {
      enqueueJob(job.id);
    });

    return NextResponse.json({ job: toJobDto(updated) });
  } catch (error) {
    if (error instanceof ReelError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось загрузить файл." },
      { status: 500 },
    );
  }
}

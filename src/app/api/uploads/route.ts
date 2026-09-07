import { after, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";
import { ALLOWED_EXTENSIONS, MAX_UPLOAD_MB } from "@/lib/config";
import { ensureCriteria, prisma } from "@/lib/db";
import { enqueueJob } from "@/lib/pipeline";
import { createReel, createTake } from "@/lib/reels";
import { toJobDto } from "@/lib/serialize";
import { ensureStorageDirs, videoPathFor } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await ensureStorageDirs();
    await ensureCriteria();

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Выберите видеофайл." }, { status: 400 });
    }

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
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось загрузить файл." },
      { status: 500 },
    );
  }
}

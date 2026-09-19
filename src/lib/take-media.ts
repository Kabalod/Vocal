import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import {
  assertOwnedObjectPath,
  createOwnedSignedUrl,
  isPrivateObjectPath,
} from "@/lib/media-access";
import { assertStoredMediaPath } from "@/lib/storage";
import { mimeFromName } from "@/lib/take-playback";

export function parseByteRange(header: string | null, size: number) {
  if (!header) return { start: 0, end: size - 1, partial: false as const };
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match) return null;
  const rawStart = match[1];
  const rawEnd = match[2];
  let start = rawStart ? Number(rawStart) : NaN;
  let end = rawEnd ? Number(rawEnd) : NaN;
  if (!rawStart && rawEnd) {
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(size - suffix, 0);
    end = size - 1;
  } else {
    if (!Number.isFinite(start)) return null;
    if (!Number.isFinite(end)) end = size - 1;
  }
  if (start < 0 || end < start || start >= size) return null;
  end = Math.min(end, size - 1);
  return { start, end, partial: start !== 0 || end !== size - 1 };
}

export async function mediaFileResponse(options: {
  storedPath: string;
  originalName: string | null;
  mimeType: string | null;
  request: Request;
  download: boolean;
}) {
  if (isPrivateObjectPath(options.storedPath)) {
    assertOwnedObjectPath(options.storedPath);
    const signed = await createOwnedSignedUrl(options.storedPath);
    return Response.redirect(signed, 302);
  }
  const safePath = await assertStoredMediaPath(options.storedPath);
  const info = await stat(safePath);
  const size = info.size;
  const range = parseByteRange(options.request.headers.get("range"), size);
  if (!range) {
    return new Response("Requested range not satisfiable", {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    });
  }
  const mime = options.mimeType || mimeFromName(options.originalName ?? safePath);
  const headers = new Headers({
    "Content-Type": mime,
    "Accept-Ranges": "bytes",
    "Content-Length": String(range.end - range.start + 1),
    "Cache-Control": "private, max-age=0, must-revalidate",
  });
  if (options.download) {
    const name = options.originalName?.replace(/[\r\n"]/g, "") || "take";
    headers.set("Content-Disposition", `attachment; filename="${name}"`);
  }
  if (range.partial) {
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
  }
  const nodeStream = createReadStream(safePath, { start: range.start, end: range.end });
  return new Response(Readable.toWeb(nodeStream) as ReadableStream, {
    status: range.partial ? 206 : 200,
    headers,
  });
}

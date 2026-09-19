import { NextResponse } from "next/server";
import { authErrorResponse, bindApiUser } from "@/lib/auth/request";
import { ExportError } from "@/lib/canonical-export";
import { exportCanonicalTxt, exportReel } from "@/lib/export-reel";
import { ReelError } from "@/lib/reels";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try { await bindApiUser(); } catch (error) { const denied = authErrorResponse(error); if (denied) return denied; throw error; }
  try {
    const { id } = await context.params;
    const url = new URL(request.url);
    const format = url.searchParams.get("format");
    const scriptId = url.searchParams.get("scriptId");
    if (format === "txt") {
      const exported = await exportCanonicalTxt(id, { scriptId });
      return new NextResponse(exported.text, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(exported.filename)}`,
        },
      });
    }
    const payload = await exportReel(id);
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof ReelError || error instanceof ExportError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Не удалось экспортировать." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { withApiUser } from "@/lib/auth/request";
import { quotaErrorResponse } from "@/lib/quota-http";
import { ReelError } from "@/lib/reels";
import { logApiError } from "@/lib/safe-log";
import { createThoughtFromText } from "@/lib/thought-create";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(error: unknown) {
  const quota = quotaErrorResponse(error);
  if (quota) return quota;
  if (error instanceof ReelError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  logApiError("thoughts", error);
  return NextResponse.json({ error: "Не удалось создать мысль.", code: "INTERNAL" }, { status: 500 });
}

export const POST = withApiUser(async (request) => {
  try {
    const body = (await request.json()) as {
      title?: unknown;
      body?: unknown;
      idempotencyKey?: unknown;
    };
    const result = await createThoughtFromText({
      title: typeof body.title === "string" ? body.title : "",
      body: typeof body.body === "string" ? body.body : "",
      idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : "",
    });
    return NextResponse.json({ reel: result.reel }, { status: result.created ? 201 : 200 });
  } catch (error) {
    return errorResponse(error);
  }
});

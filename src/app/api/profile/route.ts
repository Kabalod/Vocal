import { NextResponse } from "next/server";
import { withApiUser } from "@/lib/auth/request";
import { ProfileError, getProfile, saveProfile } from "@/lib/profile";
import { logApiError } from "@/lib/safe-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof ProfileError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  logApiError("profile", error);
  return NextResponse.json({ error: "Не удалось обработать анкету.", code: "INTERNAL" }, { status: 500 });
}

export const GET = withApiUser(async function GET() {
  try {
    const profile = await getProfile();
    return NextResponse.json({ profile });
  } catch (error) {
    return errorResponse(error);
  }
});

export const PUT = withApiUser(async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.fields === undefined) {
      throw new ProfileError("Нет полей анкеты.", "FIELDS_REQUIRED");
    }
    const profile = await saveProfile({ fields: body.fields });
    return NextResponse.json({ profile });
  } catch (error) {
    return errorResponse(error);
  }
});

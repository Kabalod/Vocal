import { NextResponse } from "next/server";
import { withApiUser } from "@/lib/auth/request";
import { ProfileError, getProfile } from "@/lib/profile";
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

export const PUT = withApiUser(async function PUT() {
  try {
    throw new ProfileError(
      "Прямое сохранение анкеты больше не используется. Портрет меняется только из диалога профиля.",
      "SAVE_PROFILE_REMOVED",
      410,
    );
  } catch (error) {
    return errorResponse(error);
  }
});

import { NextResponse } from "next/server";
import { ProfileError, getProfile, saveProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(error: unknown) {
  if (error instanceof ProfileError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error(error);
  return NextResponse.json({ error: "Не удалось обработать анкету." }, { status: 500 });
}

export async function GET() {
  try {
    const profile = await getProfile();
    return NextResponse.json({ profile });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
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
}

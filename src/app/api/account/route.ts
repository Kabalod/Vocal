import { NextResponse } from "next/server";
import { withApiUser } from "@/lib/auth/request";
import { ownerUserId } from "@/lib/auth/session";
import { deleteAccountData, sweepOrphanMedia } from "@/lib/data-deletion";
import { ReelError } from "@/lib/reels";
import { logApiError } from "@/lib/safe-log";
import { AccountAuthError, accountAuthDeletionAvailable, deleteAuthAccount } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACCOUNT_DELETE_CONFIRMATION = "УДАЛИТЬ";

/** Deletes every app row and file of the signed-in author, then the login (public.profiles, auth.users). */
export const DELETE = withApiUser(async function DELETE(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { confirm?: unknown };
    if (body.confirm !== ACCOUNT_DELETE_CONFIRMATION) {
      return NextResponse.json(
        { error: `Для подтверждения введите «${ACCOUNT_DELETE_CONFIRMATION}».`, code: "CONFIRM_REQUIRED" },
        { status: 400 },
      );
    }
    if (!accountAuthDeletionAvailable()) {
      return NextResponse.json(
        { error: "Удаление аккаунта не настроено на сервере. Данные не тронуты.", code: "ACCOUNT_AUTH_NOT_CONFIGURED" },
        { status: 503 },
      );
    }
    const owner = ownerUserId();
    const { thoughts } = await deleteAccountData(owner);
    // App data is already gone; if this step fails the same request can simply be repeated.
    await deleteAuthAccount(owner);
    void sweepOrphanMedia().catch(() => undefined);
    return NextResponse.json({ deleted: true, thoughts });
  } catch (error) {
    if (error instanceof AccountAuthError || error instanceof ReelError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    logApiError("account", error);
    return NextResponse.json({ error: "Не удалось удалить аккаунт. Повторите.", code: "INTERNAL" }, { status: 500 });
  }
});

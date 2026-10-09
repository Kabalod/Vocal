import { NextResponse } from "next/server";
import { AiBudgetError } from "@/lib/ai/usage-guard";
import { QuotaExhaustedError } from "@/lib/quota";

/** J1: 402 QUOTA_EXHAUSTED with the end of the period, and the rate limit / global switch answers. Null for any other error. */
export function quotaErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof QuotaExhaustedError) {
    return NextResponse.json({ error: error.message, code: error.code, periodEnd: error.periodEnd?.toISOString() ?? null }, { status: 402 });
  }
  if (error instanceof AiBudgetError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  return null;
}

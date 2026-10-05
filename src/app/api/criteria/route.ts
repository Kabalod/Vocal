import { NextResponse } from "next/server";
import { withApiUser } from "@/lib/auth/request";
import { ensureCriteria, prisma } from "@/lib/db";
import { toCriterionDto } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export const GET = withApiUser(async function GET() {
  await ensureCriteria();
  const rows = await prisma.criterion.findMany({
    orderBy: [{ categoryOrder: "asc" }, { sortOrder: "asc" }],
  });
  return NextResponse.json({ criteria: rows.map(toCriterionDto) });
});

const GONE = {
  error: "Веса критериев больше не используются. Настройка закрыта.",
  code: "GONE",
};

export const PUT = withApiUser(async function PUT() {
  return NextResponse.json(GONE, { status: 410 });
});

export const POST = withApiUser(async function POST() {
  return NextResponse.json(GONE, { status: 410 });
});

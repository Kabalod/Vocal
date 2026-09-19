import { NextResponse } from "next/server";
import { authErrorResponse, bindApiUser } from "@/lib/auth/request";
import { canWriteSharedCriteria } from "@/lib/auth/session";
import { z } from "zod";
import { ensureCriteria, prisma, resetCriteria } from "@/lib/db";
import { toCriterionDto } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try { await bindApiUser(); } catch (error) { const denied = authErrorResponse(error); if (denied) return denied; throw error; }
  await ensureCriteria();
  const rows = await prisma.criterion.findMany({
    orderBy: [{ categoryOrder: "asc" }, { sortOrder: "asc" }],
  });
  return NextResponse.json({ criteria: rows.map(toCriterionDto) });
}

const patchSchema = z.object({
  criteria: z.array(
    z.object({
      id: z.string(),
      enabled: z.boolean(),
      weight: z.number().int().min(5).max(50),
    }),
  ),
});

export async function PUT(request: Request) {
  try { await bindApiUser(); } catch (error) { const denied = authErrorResponse(error); if (denied) return denied; throw error; }
  if (!canWriteSharedCriteria()) {
    return NextResponse.json(
      { error: "Общие критерии может менять только администратор.", code: "CRITERIA_READONLY" },
      { status: 403 },
    );
  }
  await ensureCriteria();
  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Некорректные данные." }, { status: 400 });
  }

  if (!body.criteria.some((c) => c.enabled)) {
    return NextResponse.json(
      { error: "Оставьте хотя бы один включённый критерий." },
      { status: 400 },
    );
  }

  await prisma.$transaction(
    body.criteria.map((c) =>
      prisma.criterion.update({
        where: { id: c.id },
        data: { enabled: c.enabled, weight: c.weight },
      }),
    ),
  );

  const rows = await prisma.criterion.findMany({
    orderBy: [{ categoryOrder: "asc" }, { sortOrder: "asc" }],
  });
  return NextResponse.json({ criteria: rows.map(toCriterionDto) });
}

export async function POST() {
  try { await bindApiUser(); } catch (error) { const denied = authErrorResponse(error); if (denied) return denied; throw error; }
  if (!canWriteSharedCriteria()) {
    return NextResponse.json(
      { error: "Общие критерии может менять только администратор.", code: "CRITERIA_READONLY" },
      { status: 403 },
    );
  }
  await resetCriteria();
  const rows = await prisma.criterion.findMany({
    orderBy: [{ categoryOrder: "asc" }, { sortOrder: "asc" }],
  });
  return NextResponse.json({ criteria: rows.map(toCriterionDto) });
}

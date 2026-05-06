import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getSession, unauthorized, forbidden } from "@/lib/auth/get-session";
import { can } from "@/lib/auth/permissions";
import type { OpportunityStatus } from "@/lib/generated/prisma/enums";

const createSchema = z.object({
  title: z.string().min(1).max(255),
  pipelineId: z.string().uuid(),
  stageId: z.string().uuid(),
  contactId: z.string().uuid().optional().nullable(),
  companyId: z.string().uuid().optional().nullable(),
  assignedUserId: z.string().uuid().optional().nullable(),
  value: z.number().min(0).optional().nullable(),
  expectedCloseAt: z.string().datetime().optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

// GET /api/opportunities
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "read", "opportunities")) return forbidden();

  const { searchParams } = req.nextUrl;
  const pipelineId = searchParams.get("pipelineId");
  const stageId = searchParams.get("stageId");
  const rawStatus = searchParams.get("status");
  const statusFilter: OpportunityStatus | undefined =
    rawStatus === "open" || rawStatus === "won" || rawStatus === "lost" ? rawStatus : undefined;
  const search = searchParams.get("q") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const limit = 50;

  const where = {
    tenantId: session.tenantId,
    ...(pipelineId ? { pipelineId } : {}),
    ...(stageId ? { stageId } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(search ? { title: { contains: search, mode: "insensitive" as const } } : {}),
  };

  const [opportunities, total] = await Promise.all([
    prisma.opportunity.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        title: true,
        value: true,
        status: true,
        expectedCloseAt: true,
        closedAt: true,
        createdAt: true,
        contact: { select: { id: true, name: true } },
        company: { select: { id: true, name: true } },
        stage: { select: { id: true, name: true, order: true, probability: true } },
        assignedUser: { select: { id: true, name: true } },
      },
    }),
    prisma.opportunity.count({ where }),
  ]);

  return NextResponse.json({
    data: opportunities,
    meta: { total, page, limit, pages: Math.ceil(total / limit) },
  });
}

// POST /api/opportunities
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "create", "opportunities")) return forbidden();

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Validate pipeline + stage belong to tenant
  const stage = await prisma.pipelineStage.findFirst({
    where: {
      id: parsed.data.stageId,
      pipelineId: parsed.data.pipelineId,
      tenantId: session.tenantId,
    },
  });
  if (!stage) {
    return NextResponse.json({ error: "Etapa não encontrada neste pipeline." }, { status: 404 });
  }

  const opportunity = await prisma.opportunity.create({
    data: {
      tenantId: session.tenantId,
      title: parsed.data.title,
      pipelineId: parsed.data.pipelineId,
      stageId: parsed.data.stageId,
      contactId: parsed.data.contactId ?? null,
      companyId: parsed.data.companyId ?? null,
      assignedUserId: parsed.data.assignedUserId ?? null,
      value: parsed.data.value ?? null,
      expectedCloseAt: parsed.data.expectedCloseAt ? new Date(parsed.data.expectedCloseAt) : null,
      notes: parsed.data.notes ?? null,
    },
    select: {
      id: true,
      title: true,
      value: true,
      status: true,
      expectedCloseAt: true,
      createdAt: true,
      stage: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ data: opportunity }, { status: 201 });
}

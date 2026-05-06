import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getSession, unauthorized, forbidden } from "@/lib/auth/get-session";
import { can } from "@/lib/auth/permissions";
import { suggestNextAction } from "@/lib/ai/actions/suggest-next-action";

const updateSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  stageId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional().nullable(),
  companyId: z.string().uuid().optional().nullable(),
  assignedUserId: z.string().uuid().optional().nullable(),
  value: z.number().min(0).optional().nullable(),
  status: z.enum(["open", "won", "lost"]).optional(),
  expectedCloseAt: z.string().datetime().optional().nullable(),
  closedAt: z.string().datetime().optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

async function findOpportunity(id: string, tenantId: string) {
  return prisma.opportunity.findFirst({ where: { id, tenantId } });
}

// GET /api/opportunities/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "read", "opportunities")) return forbidden();

  const { id } = await params;
  const opp = await prisma.opportunity.findFirst({
    where: { id, tenantId: session.tenantId },
    include: {
      contact: { select: { id: true, name: true, email: true } },
      company: { select: { id: true, name: true } },
      stage: { select: { id: true, name: true, probability: true } },
      pipeline: { select: { id: true, name: true } },
      assignedUser: { select: { id: true, name: true } },
    },
  });
  if (!opp) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  return NextResponse.json({ data: opp });
}

// PATCH /api/opportunities/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "update", "opportunities")) return forbidden();

  const { id } = await params;
  const existing = await findOpportunity(id, session.tenantId);
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // If stageId provided, verify it belongs to same pipeline + tenant
  if (parsed.data.stageId) {
    const stage = await prisma.pipelineStage.findFirst({
      where: { id: parsed.data.stageId, pipelineId: existing.pipelineId, tenantId: session.tenantId },
    });
    if (!stage) return NextResponse.json({ error: "Etapa inválida para este pipeline." }, { status: 400 });
  }

  // Auto-set closedAt when marking won/lost
  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.status === "won" || parsed.data.status === "lost") {
    if (!existing.closedAt && !parsed.data.closedAt) {
      data.closedAt = new Date();
    }
  }
  if (parsed.data.status === "open") {
    data.closedAt = null;
  }

  if (parsed.data.expectedCloseAt !== undefined) {
    data.expectedCloseAt = parsed.data.expectedCloseAt ? new Date(parsed.data.expectedCloseAt) : null;
  }
  if (parsed.data.closedAt !== undefined && parsed.data.closedAt !== null) {
    data.closedAt = new Date(parsed.data.closedAt);
  }

  const opportunity = await prisma.opportunity.update({ where: { id }, data });

  // Auto-generate revenue when marking won (upsert — never duplicates)
  if (parsed.data.status === "won") {
    await prisma.revenue.upsert({
      where: { opportunityId: id },
      create: {
        tenantId: session.tenantId,
        opportunityId: id,
        contactId: opportunity.contactId ?? null,
        companyId: opportunity.companyId ?? null,
        amount: Number(opportunity.value) || 0,
        status: "pending",
        description: `Venda ganha: ${opportunity.title}`,
      },
      update: {},
    });
  }

  // Fire-and-forget: suggest next action on stage change or won/lost
  if (parsed.data.stageId || parsed.data.status) {
    const stageName = parsed.data.stageId
      ? (await prisma.pipelineStage.findUnique({ where: { id: parsed.data.stageId }, select: { name: true } }))?.name
      : undefined;
    const stalledDays = Math.floor(
      (Date.now() - existing.updatedAt.getTime()) / 86400000
    );
    suggestNextAction({
      tenantId: session.tenantId,
      userId: session.id,
      opportunityId: opportunity.id,
      contactId: opportunity.contactId ?? undefined,
      opportunityStatus: opportunity.status,
      stageName,
      daysSinceLastContact: stalledDays,
    }).catch(() => {});
  }

  return NextResponse.json({ data: opportunity });
}

// DELETE /api/opportunities/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "delete", "opportunities")) return forbidden();

  const { id } = await params;
  const existing = await findOpportunity(id, session.tenantId);
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  await prisma.opportunity.delete({ where: { id } });
  return NextResponse.json({ data: { id } });
}

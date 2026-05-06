import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getSession, unauthorized, forbidden } from "@/lib/auth/get-session";
import { can } from "@/lib/auth/permissions";

const updateStageSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  order: z.number().int().min(1).optional(),
  probability: z.number().int().min(0).max(100).optional(),
});

async function findStage(stageId: string, pipelineId: string, tenantId: string) {
  return prisma.pipelineStage.findFirst({
    where: { id: stageId, pipelineId, tenantId },
  });
}

// PATCH /api/pipelines/[id]/stages/[stageId]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; stageId: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "update", "pipelines")) return forbidden();

  const { id: pipelineId, stageId } = await params;
  const existing = await findStage(stageId, pipelineId, session.tenantId);
  if (!existing) return NextResponse.json({ error: "Etapa não encontrada." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = updateStageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const stage = await prisma.pipelineStage.update({
    where: { id: stageId },
    data: parsed.data,
  });

  return NextResponse.json({ data: stage });
}

// DELETE /api/pipelines/[id]/stages/[stageId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; stageId: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "update", "pipelines")) return forbidden();

  const { id: pipelineId, stageId } = await params;
  const existing = await findStage(stageId, pipelineId, session.tenantId);
  if (!existing) return NextResponse.json({ error: "Etapa não encontrada." }, { status: 404 });

  await prisma.pipelineStage.delete({ where: { id: stageId } });
  return NextResponse.json({ data: { id: stageId } });
}

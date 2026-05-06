import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getSession, unauthorized, forbidden } from "@/lib/auth/get-session";
import { can } from "@/lib/auth/permissions";

const createStageSchema = z.object({
  name: z.string().min(1).max(100),
  order: z.number().int().min(1),
  probability: z.number().int().min(0).max(100).optional(),
});

// POST /api/pipelines/[id]/stages
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "update", "pipelines")) return forbidden();

  const { id: pipelineId } = await params;
  const pipeline = await prisma.pipeline.findFirst({
    where: { id: pipelineId, tenantId: session.tenantId },
  });
  if (!pipeline) return NextResponse.json({ error: "Pipeline não encontrado." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = createStageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const stage = await prisma.pipelineStage.create({
    data: {
      pipelineId,
      tenantId: session.tenantId,
      name: parsed.data.name,
      order: parsed.data.order,
      probability: parsed.data.probability ?? 0,
    },
  });

  return NextResponse.json({ data: stage }, { status: 201 });
}

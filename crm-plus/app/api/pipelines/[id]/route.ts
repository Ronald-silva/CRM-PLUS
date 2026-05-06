import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getSession, unauthorized, forbidden } from "@/lib/auth/get-session";
import { can } from "@/lib/auth/permissions";

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  isDefault: z.boolean().optional(),
});

async function findPipeline(id: string, tenantId: string) {
  return prisma.pipeline.findFirst({ where: { id, tenantId } });
}

// GET /api/pipelines/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "read", "pipelines")) return forbidden();

  const { id } = await params;
  const pipeline = await prisma.pipeline.findFirst({
    where: { id, tenantId: session.tenantId },
    include: { stages: { orderBy: { order: "asc" } } },
  });
  if (!pipeline) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  return NextResponse.json({ data: pipeline });
}

// PATCH /api/pipelines/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "update", "pipelines")) return forbidden();

  const { id } = await params;
  const existing = await findPipeline(id, session.tenantId);
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  if (parsed.data.isDefault) {
    await prisma.pipeline.updateMany({
      where: { tenantId: session.tenantId, id: { not: id } },
      data: { isDefault: false },
    });
  }

  const pipeline = await prisma.pipeline.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ data: pipeline });
}

// DELETE /api/pipelines/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "delete", "pipelines")) return forbidden();

  const { id } = await params;
  const existing = await findPipeline(id, session.tenantId);
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  await prisma.pipeline.delete({ where: { id } });
  return NextResponse.json({ data: { id } });
}

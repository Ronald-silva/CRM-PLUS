import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getSession, unauthorized, forbidden } from "@/lib/auth/get-session";
import { can } from "@/lib/auth/permissions";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().nullable(),
  isDefault: z.boolean().optional(),
});

// GET /api/pipelines
export async function GET(_req: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "read", "pipelines")) return forbidden();

  const pipelines = await prisma.pipeline.findMany({
    where: { tenantId: session.tenantId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      isDefault: true,
      createdAt: true,
      stages: {
        orderBy: { order: "asc" },
        select: { id: true, name: true, order: true, probability: true },
      },
    },
  });

  return NextResponse.json({ data: pipelines });
}

// POST /api/pipelines
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "create", "pipelines")) return forbidden();

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  if (parsed.data.isDefault) {
    await prisma.pipeline.updateMany({
      where: { tenantId: session.tenantId },
      data: { isDefault: false },
    });
  }

  const pipeline = await prisma.pipeline.create({
    data: {
      tenantId: session.tenantId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      isDefault: parsed.data.isDefault ?? false,
    },
  });

  return NextResponse.json({ data: pipeline }, { status: 201 });
}

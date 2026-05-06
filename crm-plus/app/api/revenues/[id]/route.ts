import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getSession, unauthorized, forbidden } from "@/lib/auth/get-session";
import { can } from "@/lib/auth/permissions";

const updateSchema = z.object({
  status: z.enum(["pending", "paid", "cancelled"]).optional(),
  paidAt: z.string().datetime().optional().nullable(),
  dueAt: z.string().datetime().optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
});

// PATCH /api/revenues/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "update", "billing")) return forbidden();

  const { id } = await params;
  const existing = await prisma.revenue.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data: Record<string, unknown> = {};

  if (parsed.data.status !== undefined) {
    data.status = parsed.data.status;
    // Auto-set paidAt when marking as paid
    if (parsed.data.status === "paid" && !existing.paidAt && parsed.data.paidAt === undefined) {
      data.paidAt = new Date();
    }
    // Clear paidAt when reverting from paid
    if (parsed.data.status !== "paid" && parsed.data.paidAt === undefined) {
      data.paidAt = null;
    }
  }

  if (parsed.data.paidAt !== undefined) {
    data.paidAt = parsed.data.paidAt ? new Date(parsed.data.paidAt) : null;
  }

  if (parsed.data.dueAt !== undefined) {
    data.dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;
  }

  if (parsed.data.description !== undefined) {
    data.description = parsed.data.description;
  }

  const revenue = await prisma.revenue.update({
    where: { id },
    data,
    select: {
      id: true,
      amount: true,
      status: true,
      description: true,
      paidAt: true,
      dueAt: true,
      createdAt: true,
      updatedAt: true,
      opportunity: { select: { id: true, title: true } },
      contact: { select: { id: true, name: true, email: true } },
      company: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ data: revenue });
}

// GET /api/revenues/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "read", "billing")) return forbidden();

  const { id } = await params;
  const revenue = await prisma.revenue.findFirst({
    where: { id, tenantId: session.tenantId },
    select: {
      id: true,
      amount: true,
      status: true,
      description: true,
      paidAt: true,
      dueAt: true,
      createdAt: true,
      updatedAt: true,
      opportunity: { select: { id: true, title: true } },
      contact: { select: { id: true, name: true, email: true } },
      company: { select: { id: true, name: true } },
    },
  });
  if (!revenue) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  return NextResponse.json({ data: revenue });
}

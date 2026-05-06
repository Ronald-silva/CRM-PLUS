import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getSession, unauthorized, forbidden } from "@/lib/auth/get-session";
import { can } from "@/lib/auth/permissions";

const updateSchema = z.object({
  quantity: z.number().int().min(1).optional(),
  unitPrice: z.number().min(0).optional(),
});

async function recalcOpportunityValue(opportunityId: string) {
  const items = await prisma.opportunityProduct.findMany({
    where: { opportunityId },
    select: { totalPrice: true },
  });
  const total = items.reduce((sum, i) => sum + Number(i.totalPrice), 0);
  await prisma.opportunity.update({
    where: { id: opportunityId },
    data: { value: total },
  });
}

async function findItem(opportunityId: string, productId: string, tenantId: string) {
  return prisma.opportunityProduct.findFirst({
    where: { opportunityId, productId, tenantId },
  });
}

// PATCH /api/opportunities/[id]/products/[productId]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; productId: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "update", "opportunities")) return forbidden();

  const { id: opportunityId, productId } = await params;

  const opp = await prisma.opportunity.findFirst({ where: { id: opportunityId, tenantId: session.tenantId } });
  if (!opp) return NextResponse.json({ error: "Oportunidade não encontrada." }, { status: 404 });

  const existing = await findItem(opportunityId, productId, session.tenantId);
  if (!existing) return NextResponse.json({ error: "Item não encontrado." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", details: parsed.error.flatten() }, { status: 400 });
  }

  const quantity = parsed.data.quantity ?? existing.quantity;
  const unitPrice = parsed.data.unitPrice !== undefined
    ? parsed.data.unitPrice
    : Number(existing.unitPrice);
  const totalPrice = unitPrice * quantity;

  const item = await prisma.opportunityProduct.update({
    where: { id: existing.id },
    data: { quantity, unitPrice, totalPrice },
    select: {
      id: true,
      quantity: true,
      unitPrice: true,
      totalPrice: true,
      product: { select: { id: true, name: true, category: true } },
    },
  });

  await recalcOpportunityValue(opportunityId);

  return NextResponse.json({ data: item });
}

// DELETE /api/opportunities/[id]/products/[productId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; productId: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "update", "opportunities")) return forbidden();

  const { id: opportunityId, productId } = await params;

  const opp = await prisma.opportunity.findFirst({ where: { id: opportunityId, tenantId: session.tenantId } });
  if (!opp) return NextResponse.json({ error: "Oportunidade não encontrada." }, { status: 404 });

  const existing = await findItem(opportunityId, productId, session.tenantId);
  if (!existing) return NextResponse.json({ error: "Item não encontrado." }, { status: 404 });

  await prisma.opportunityProduct.delete({ where: { id: existing.id } });
  await recalcOpportunityValue(opportunityId);

  return NextResponse.json({ data: { opportunityId, productId } });
}

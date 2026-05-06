import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getSession, unauthorized, forbidden } from "@/lib/auth/get-session";
import { can } from "@/lib/auth/permissions";

const addSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).optional(),
  unitPrice: z.number().min(0).optional(), // if omitted, use product's current price
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

// GET /api/opportunities/[id]/products
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "read", "opportunities")) return forbidden();

  const { id: opportunityId } = await params;
  const opp = await prisma.opportunity.findFirst({ where: { id: opportunityId, tenantId: session.tenantId } });
  if (!opp) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  const products = await prisma.opportunityProduct.findMany({
    where: { opportunityId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      quantity: true,
      unitPrice: true,
      totalPrice: true,
      product: { select: { id: true, name: true, category: true } },
    },
  });

  return NextResponse.json({ data: products });
}

// POST /api/opportunities/[id]/products — add a product
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "update", "opportunities")) return forbidden();

  const { id: opportunityId } = await params;
  const opp = await prisma.opportunity.findFirst({ where: { id: opportunityId, tenantId: session.tenantId } });
  if (!opp) return NextResponse.json({ error: "Oportunidade não encontrada." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", details: parsed.error.flatten() }, { status: 400 });
  }

  const product = await prisma.product.findFirst({
    where: { id: parsed.data.productId, tenantId: session.tenantId, status: "active" },
  });
  if (!product) return NextResponse.json({ error: "Produto não encontrado ou inativo." }, { status: 404 });

  const quantity = parsed.data.quantity ?? 1;
  const unitPrice = parsed.data.unitPrice !== undefined
    ? parsed.data.unitPrice
    : Number(product.price);
  const totalPrice = unitPrice * quantity;

  const existing = await prisma.opportunityProduct.findUnique({
    where: { opportunityId_productId: { opportunityId, productId: parsed.data.productId } },
  });
  if (existing) {
    return NextResponse.json({ error: "Produto já vinculado a esta oportunidade." }, { status: 409 });
  }

  const item = await prisma.opportunityProduct.create({
    data: {
      tenantId: session.tenantId,
      opportunityId,
      productId: parsed.data.productId,
      quantity,
      unitPrice,
      totalPrice,
    },
    select: {
      id: true,
      quantity: true,
      unitPrice: true,
      totalPrice: true,
      product: { select: { id: true, name: true, category: true } },
    },
  });

  await recalcOpportunityValue(opportunityId);

  return NextResponse.json({ data: item }, { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getSession, unauthorized, forbidden } from "@/lib/auth/get-session";
import { can } from "@/lib/auth/permissions";

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional().nullable(),
  price: z.number().min(0).optional(),
  category: z.string().max(100).optional().nullable(),
  status: z.enum(["active", "inactive"]).optional(),
});

async function findProduct(id: string, tenantId: string) {
  return prisma.product.findFirst({ where: { id, tenantId } });
}

// GET /api/products/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "read", "products")) return forbidden();

  const { id } = await params;
  const product = await findProduct(id, session.tenantId);
  if (!product) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  return NextResponse.json({ data: product });
}

// PATCH /api/products/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "update", "products")) return forbidden();

  const { id } = await params;
  const existing = await findProduct(id, session.tenantId);
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const product = await prisma.product.update({
    where: { id },
    data: parsed.data,
  });

  return NextResponse.json({ data: product });
}

// DELETE /api/products/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "delete", "products")) return forbidden();

  const { id } = await params;
  const existing = await findProduct(id, session.tenantId);
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  await prisma.product.delete({ where: { id } });
  return NextResponse.json({ data: { id } });
}

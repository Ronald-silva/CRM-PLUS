import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getSession, unauthorized, forbidden } from "@/lib/auth/get-session";
import { can } from "@/lib/auth/permissions";

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  domain: z.string().max(255).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

async function findCompany(id: string, tenantId: string) {
  return prisma.company.findFirst({ where: { id, tenantId } });
}

// GET /api/companies/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "read", "companies")) return forbidden();

  const { id } = await params;
  const company = await findCompany(id, session.tenantId);
  if (!company) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  return NextResponse.json({ data: company });
}

// PATCH /api/companies/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "update", "companies")) return forbidden();

  const { id } = await params;
  const existing = await findCompany(id, session.tenantId);
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const company = await prisma.company.update({
    where: { id },
    data: parsed.data,
  });

  return NextResponse.json({ data: company });
}

// DELETE /api/companies/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "delete", "companies")) return forbidden();

  const { id } = await params;
  const existing = await findCompany(id, session.tenantId);
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  await prisma.company.delete({ where: { id } });
  return NextResponse.json({ data: { id } });
}

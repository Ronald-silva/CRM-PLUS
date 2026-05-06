import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getSession, unauthorized, forbidden } from "@/lib/auth/get-session";
import { can } from "@/lib/auth/permissions";

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  status: z.enum(["lead", "customer", "inactive"]).optional(),
});

async function findContact(id: string, tenantId: string) {
  return prisma.contact.findFirst({ where: { id, tenantId } });
}

// GET /api/contacts/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "read", "contacts")) return forbidden();

  const { id } = await params;
  const contact = await findContact(id, session.tenantId);
  if (!contact) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  return NextResponse.json({ data: contact });
}

// PATCH /api/contacts/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "update", "contacts")) return forbidden();

  const { id } = await params;
  const existing = await findContact(id, session.tenantId);
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const contact = await prisma.contact.update({
    where: { id },
    data: parsed.data,
  });

  return NextResponse.json({ data: contact });
}

// DELETE /api/contacts/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "delete", "contacts")) return forbidden();

  const { id } = await params;
  const existing = await findContact(id, session.tenantId);
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  await prisma.contact.delete({ where: { id } });
  return NextResponse.json({ data: { id } });
}

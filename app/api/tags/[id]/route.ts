import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getSession, unauthorized, forbidden } from "@/lib/auth/get-session";
import { can } from "@/lib/auth/permissions";

const updateSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
});

async function findTag(id: string, tenantId: string) {
  return prisma.tag.findFirst({ where: { id, tenantId } });
}

// PATCH /api/tags/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "update", "tags")) return forbidden();

  const { id } = await params;
  const existing = await findTag(id, session.tenantId);
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  if (parsed.data.name && parsed.data.name !== existing.name) {
    const conflict = await prisma.tag.findUnique({
      where: { tenantId_name: { tenantId: session.tenantId, name: parsed.data.name } },
    });
    if (conflict) {
      return NextResponse.json({ error: "Já existe uma tag com esse nome." }, { status: 409 });
    }
  }

  const tag = await prisma.tag.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ data: tag });
}

// DELETE /api/tags/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "delete", "tags")) return forbidden();

  const { id } = await params;
  const existing = await findTag(id, session.tenantId);
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  await prisma.tag.delete({ where: { id } });
  return NextResponse.json({ data: { id } });
}

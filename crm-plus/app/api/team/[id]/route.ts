import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getSession, unauthorized, forbidden } from "@/lib/auth/get-session";
import { can } from "@/lib/auth/permissions";

const ASSIGNABLE_ROLES = ["owner", "manager", "salesperson", "attendant", "financial", "viewer"] as const;

const patchSchema = z.object({
  name:     z.string().min(2).max(255).optional(),
  phone:    z.string().max(50).optional().nullable(),
  role:     z.enum(ASSIGNABLE_ROLES).optional(),
  isActive: z.boolean().optional(),
});

// PATCH /api/team/[id] — update user
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "update", "team")) return forbidden();

  const { id } = await params;

  const target = await prisma.user.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!target) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

  const body   = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Dados inválidos.", details: parsed.error.flatten() }, { status: 400 });

  // ── Last-owner guard ──────────────────────────────────────────────────────
  // Prevent removing the last active owner by deactivating or changing their role.
  const wouldLoseOwner =
    target.role === "owner" &&
    (parsed.data.isActive === false ||
      (parsed.data.role !== undefined && parsed.data.role !== "owner"));

  if (wouldLoseOwner) {
    const ownerCount = await prisma.user.count({
      where: { tenantId: session.tenantId, role: "owner", isActive: true },
    });
    if (ownerCount <= 1)
      return NextResponse.json(
        { error: "Não é possível remover ou alterar o único owner ativo da conta." },
        { status: 400 }
      );
  }

  // ── Self-deactivation guard ───────────────────────────────────────────────
  if (id === session.id && parsed.data.isActive === false)
    return NextResponse.json({ error: "Você não pode desativar sua própria conta." }, { status: 400 });

  const user = await prisma.user.update({
    where: { id },
    data:  {
      ...(parsed.data.name     !== undefined ? { name:     parsed.data.name }     : {}),
      ...(parsed.data.phone    !== undefined ? { phone:    parsed.data.phone }    : {}),
      ...(parsed.data.role     !== undefined ? { role:     parsed.data.role }     : {}),
      ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
    },
    select: { id: true, name: true, email: true, phone: true, role: true, isActive: true, updatedAt: true },
  });

  return NextResponse.json({ data: user });
}

// DELETE /api/team/[id] — hard delete (guards apply)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "delete", "team")) return forbidden();

  const { id } = await params;

  if (id === session.id)
    return NextResponse.json({ error: "Você não pode remover sua própria conta." }, { status: 400 });

  const target = await prisma.user.findFirst({
    where: { id, tenantId: session.tenantId },
  });
  if (!target) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

  // Last-owner guard
  if (target.role === "owner") {
    const ownerCount = await prisma.user.count({
      where: { tenantId: session.tenantId, role: "owner", isActive: true },
    });
    if (ownerCount <= 1)
      return NextResponse.json(
        { error: "Não é possível remover o único owner ativo da conta." },
        { status: 400 }
      );
  }

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ success: true });
}

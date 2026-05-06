import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getSession, unauthorized, forbidden } from "@/lib/auth/get-session";
import { can } from "@/lib/auth/permissions";
import type { TaskStatus, TaskPriority } from "@/lib/generated/prisma/enums";

const updateSchema = z.object({
  title:          z.string().min(1).max(255).optional(),
  description:    z.string().max(2000).optional().nullable(),
  status:         z.enum(["pending", "done", "cancelled"]).optional(),
  priority:       z.enum(["low", "medium", "high"]).optional(),
  assignedUserId: z.string().uuid().optional().nullable(),
  dueAt:          z.string().datetime().optional().nullable(),
});

// PATCH /api/tasks/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "update", "tasks")) return forbidden();

  const { id } = await params;
  const existing = await prisma.task.findFirst({ where: { id, tenantId: session.tenantId } });
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
  if (parsed.data.title          !== undefined) data.title          = parsed.data.title;
  if (parsed.data.description    !== undefined) data.description    = parsed.data.description;
  if (parsed.data.status         !== undefined) data.status         = parsed.data.status as TaskStatus;
  if (parsed.data.priority       !== undefined) data.priority       = parsed.data.priority as TaskPriority;
  if (parsed.data.assignedUserId !== undefined) data.assignedUserId = parsed.data.assignedUserId;
  if (parsed.data.dueAt          !== undefined) data.dueAt          = parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;

  const task = await prisma.task.update({
    where: { id },
    data,
    select: {
      id: true, title: true, description: true, status: true,
      priority: true, source: true, dueAt: true, updatedAt: true,
      contact:      { select: { id: true, name: true } },
      opportunity:  { select: { id: true, title: true } },
      assignedUser: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ data: task });
}

// DELETE /api/tasks/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "delete", "tasks")) return forbidden();

  const { id } = await params;
  const existing = await prisma.task.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!existing) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ data: { id } });
}

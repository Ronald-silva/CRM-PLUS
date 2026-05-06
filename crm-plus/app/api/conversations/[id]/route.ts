import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getSession, unauthorized, forbidden } from "@/lib/auth/get-session";
import { can } from "@/lib/auth/permissions";
import type { ConversationStatus } from "@/lib/generated/prisma/enums";

const updateSchema = z.object({
  status:         z.enum(["open", "pending", "resolved"]).optional(),
  assignedUserId: z.string().uuid().optional().nullable(),
  subject:        z.string().max(255).optional().nullable(),
});

// GET /api/conversations/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "read", "conversations")) return forbidden();

  const { id } = await params;
  const conv = await prisma.conversation.findFirst({
    where: { id, tenantId: session.tenantId },
    select: {
      id:            true,
      channel:       true,
      status:        true,
      subject:       true,
      lastMessageAt: true,
      createdAt:     true,
      updatedAt:     true,
      contact:      { select: { id: true, name: true, email: true, phone: true } },
      assignedUser: { select: { id: true, name: true } },
      messages: {
        orderBy: { sentAt: "asc" },
        select: {
          id: true, content: true, direction: true,
          senderType: true, senderId: true, sentAt: true,
        },
      },
    },
  });

  if (!conv) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  return NextResponse.json({ data: conv });
}

// PATCH /api/conversations/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "update", "conversations")) return forbidden();

  const { id } = await params;
  const existing = await prisma.conversation.findFirst({ where: { id, tenantId: session.tenantId } });
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
  if (parsed.data.status         !== undefined) data.status         = parsed.data.status as ConversationStatus;
  if (parsed.data.assignedUserId !== undefined) data.assignedUserId = parsed.data.assignedUserId;
  if (parsed.data.subject        !== undefined) data.subject        = parsed.data.subject;

  const conv = await prisma.conversation.update({
    where: { id },
    data,
    select: {
      id: true, channel: true, status: true, subject: true,
      lastMessageAt: true, updatedAt: true,
      contact:      { select: { id: true, name: true } },
      assignedUser: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ data: conv });
}

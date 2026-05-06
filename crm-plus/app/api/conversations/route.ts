import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getSession, unauthorized, forbidden } from "@/lib/auth/get-session";
import { can } from "@/lib/auth/permissions";
import type { ConversationStatus, ConversationChannel } from "@/lib/generated/prisma/enums";

const VALID_STATUSES:  ConversationStatus[]  = ["open", "pending", "resolved"];
const VALID_CHANNELS:  ConversationChannel[] = ["manual", "whatsapp", "instagram", "email"];

const createSchema = z.object({
  contactId:      z.string().uuid().optional().nullable(),
  assignedUserId: z.string().uuid().optional().nullable(),
  channel:        z.enum(["manual", "whatsapp", "instagram", "email"]).optional(),
  subject:        z.string().max(255).optional().nullable(),
});

// GET /api/conversations
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "read", "conversations")) return forbidden();

  const { searchParams } = new URL(req.url);
  const rawStatus  = searchParams.get("status");
  const rawChannel = searchParams.get("channel");
  const contactId  = searchParams.get("contactId") ?? undefined;
  const page  = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));

  const statusFilter: ConversationStatus | undefined =
    rawStatus && VALID_STATUSES.includes(rawStatus as ConversationStatus)
      ? (rawStatus as ConversationStatus) : undefined;

  const channelFilter: ConversationChannel | undefined =
    rawChannel && VALID_CHANNELS.includes(rawChannel as ConversationChannel)
      ? (rawChannel as ConversationChannel) : undefined;

  const where = {
    tenantId: session.tenantId,
    ...(statusFilter  ? { status:    statusFilter  } : {}),
    ...(channelFilter ? { channel:   channelFilter } : {}),
    ...(contactId     ? { contactId: contactId     } : {}),
  };

  const [conversations, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id:            true,
        channel:       true,
        status:        true,
        subject:       true,
        lastMessageAt: true,
        createdAt:     true,
        contact:       { select: { id: true, name: true, email: true, phone: true } },
        assignedUser:  { select: { id: true, name: true } },
        messages: {
          orderBy: { sentAt: "desc" },
          take: 1,
          select: { content: true, direction: true, senderType: true, sentAt: true },
        },
      },
    }),
    prisma.conversation.count({ where }),
  ]);

  return NextResponse.json({
    data: conversations,
    meta: { total, page, limit, pages: Math.ceil(total / limit) },
  });
}

// POST /api/conversations
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "create", "conversations")) return forbidden();

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const d = parsed.data;

  if (d.contactId) {
    const contact = await prisma.contact.findFirst({
      where: { id: d.contactId, tenantId: session.tenantId },
    });
    if (!contact) return NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });
  }

  const conversation = await prisma.conversation.create({
    data: {
      tenantId:       session.tenantId,
      contactId:      d.contactId ?? null,
      assignedUserId: d.assignedUserId ?? null,
      channel:        (d.channel as ConversationChannel) ?? "manual",
      subject:        d.subject ?? null,
      status:         "open",
    },
    select: {
      id: true, channel: true, status: true, subject: true,
      lastMessageAt: true, createdAt: true,
      contact:      { select: { id: true, name: true, email: true } },
      assignedUser: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ data: conversation }, { status: 201 });
}

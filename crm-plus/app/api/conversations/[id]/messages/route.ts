import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getSession, unauthorized, forbidden } from "@/lib/auth/get-session";
import { can } from "@/lib/auth/permissions";
import { suggestNextAction } from "@/lib/ai/actions/suggest-next-action";
import { sendChannelMessage } from "@/lib/channels/send-message";

const createSchema = z.object({
  content:    z.string().min(1).max(10000),
  direction:  z.enum(["inbound", "outbound"]).optional(),
  senderType: z.enum(["user", "contact", "bot"]).optional(),
});

// GET /api/conversations/[id]/messages
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "read", "conversations")) return forbidden();

  const { id } = await params;
  const conv = await prisma.conversation.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!conv) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  const messages = await prisma.message.findMany({
    where:   { conversationId: id },
    orderBy: { sentAt: "asc" },
    select: {
      id: true, content: true, direction: true,
      senderType: true, senderId: true,
      externalId: true, externalStatus: true,
      sentAt: true, createdAt: true,
    },
  });

  return NextResponse.json({ data: messages });
}

// POST /api/conversations/[id]/messages
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "create", "conversations")) return forbidden();

  const { id } = await params;

  const conv = await prisma.conversation.findFirst({
    where:  { id, tenantId: session.tenantId },
    select: {
      id: true, channel: true, contactId: true,
      contact: { select: { phone: true, externalId: true } },
    },
  });
  if (!conv) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const direction  = parsed.data.direction  ?? "outbound";
  const senderType = parsed.data.senderType ?? (direction === "outbound" ? "user" : "contact");

  const now = new Date();

  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: id,
        tenantId:       session.tenantId,
        content:        parsed.data.content,
        direction,
        senderType,
        senderId:       senderType === "user" ? session.id : null,
        sentAt:         now,
      },
    }),
    prisma.conversation.update({
      where: { id },
      data:  { lastMessageAt: now, status: "open" },
    }),
  ]);

  // ── Outbound: route to channel adapter ────────────────────────────────────
  if (direction === "outbound" && conv.channel !== "manual") {
    const channel = conv.channel as "whatsapp" | "instagram" | "email";
    const sendResult = await sendChannelMessage({
      channel,
      content:         parsed.data.content,
      recipientPhone:  conv.contact?.phone  ?? undefined,
      recipientPsid:   conv.contact?.externalId ?? undefined,
    });

    await prisma.message.update({
      where: { id: message.id },
      data:  {
        externalId:    sendResult.externalId,
        externalStatus: sendResult.externalStatus,
        deliveryError: sendResult.deliveryError ?? null,
      },
    });

    // Fire-and-forget: suggest next action after outbound message
    if (conv.contactId) {
      suggestNextAction({
        tenantId:             session.tenantId,
        userId:               session.id,
        contactId:            conv.contactId,
        opportunityStatus:    undefined,
        daysSinceLastContact: 0,
      }).catch(() => {});
    }

    return NextResponse.json({
      data: { ...message, externalId: sendResult.externalId, externalStatus: sendResult.externalStatus },
    }, { status: 201 });
  }

  // Manual channel or inbound — no external send
  if (direction === "outbound" && conv.contactId) {
    suggestNextAction({
      tenantId:             session.tenantId,
      userId:               session.id,
      contactId:            conv.contactId,
      opportunityStatus:    undefined,
      daysSinceLastContact: 0,
    }).catch(() => {});
  }

  return NextResponse.json({ data: message }, { status: 201 });
}

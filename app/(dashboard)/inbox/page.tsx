import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { InboxClient } from "./inbox-client";
import type { ConversationStatus, ConversationChannel } from "@/lib/generated/prisma/enums";

const VALID_STATUSES:  ConversationStatus[]  = ["open", "pending", "resolved"];
const VALID_CHANNELS:  ConversationChannel[] = ["manual", "whatsapp", "instagram", "email"];

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; channel?: string; convId?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  if (!can(session.user.role, "read", "conversations")) redirect("/dashboard");

  const tenantId = session.user.tenantId;
  const p = await searchParams;

  const statusFilter: ConversationStatus | undefined =
    p.status && VALID_STATUSES.includes(p.status as ConversationStatus)
      ? (p.status as ConversationStatus) : undefined;

  const channelFilter: ConversationChannel | undefined =
    p.channel && VALID_CHANNELS.includes(p.channel as ConversationChannel)
      ? (p.channel as ConversationChannel) : undefined;

  const where = {
    tenantId,
    ...(statusFilter  ? { status:  statusFilter  } : {}),
    ...(channelFilter ? { channel: channelFilter } : {}),
  };

  const [conversations, contacts, statusCounts] = await Promise.all([
    prisma.conversation.findMany({
      where,
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      take: 60,
      select: {
        id:            true,
        channel:       true,
        status:        true,
        subject:       true,
        lastMessageAt: true,
        createdAt:     true,
        detectedIntent: true,
        summaryText:    true,
        contact:      { select: { id: true, name: true, email: true } },
        assignedUser: { select: { id: true, name: true } },
        messages: {
          orderBy: { sentAt: "desc" },
          take: 1,
          select: { content: true, direction: true, sentAt: true },
        },
      },
    }),
    prisma.contact.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
    prisma.conversation.groupBy({
      by: ["status"],
      where: { tenantId },
      _count: { _all: true },
    }),
  ]);

  // If convId in URL, load that conversation's messages
  let activeConversation: {
    id: string; channel: string; status: string; subject: string | null;
    lastMessageAt: Date | null; createdAt: Date;
    detectedIntent: string | null; summaryText: string | null;
    contact: { id: string; name: string; email: string | null } | null;
    assignedUser: { id: string; name: string } | null;
    messages: { id: string; content: string; direction: string; senderType: string; sentAt: Date }[];
  } | null = null;

  if (p.convId) {
    activeConversation = await prisma.conversation.findFirst({
      where: { id: p.convId, tenantId },
      select: {
        id: true, channel: true, status: true, subject: true,
        lastMessageAt: true, createdAt: true,
        detectedIntent: true, summaryText: true,
        contact:      { select: { id: true, name: true, email: true } },
        assignedUser: { select: { id: true, name: true } },
        messages: {
          orderBy: { sentAt: "asc" },
          select: {
            id: true, content: true, direction: true,
            senderType: true, sentAt: true,
          },
        },
      },
    });
  }

  const sc = Object.fromEntries(statusCounts.map((c) => [c.status, c._count._all])) as Record<string, number>;
  const canCreate = can(session.user.role, "create", "conversations");
  const canUpdate = can(session.user.role, "update", "conversations");

  // JSON.parse/stringify converts Date → ISO string at runtime; cast to satisfy TS
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = (v: unknown) => JSON.parse(JSON.stringify(v)) as any;

  return (
    <InboxClient
      conversations={s(conversations)}
      contacts={contacts}
      statusCounts={sc}
      activeConversation={activeConversation ? s(activeConversation) : null}
      currentUserId={session.user.id}
      canCreate={canCreate}
      canUpdate={canUpdate}
    />
  );
}

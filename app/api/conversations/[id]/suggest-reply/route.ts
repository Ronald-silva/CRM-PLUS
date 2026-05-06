import { NextRequest, NextResponse } from "next/server";
import { getSession, unauthorized, forbidden } from "@/lib/auth/get-session";
import { can } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/client";
import { suggestReply } from "@/lib/ai/actions/suggest-reply";

// POST /api/conversations/[id]/suggest-reply
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "read", "conversations")) return forbidden();

  const { id } = await params;
  const conv = await prisma.conversation.findFirst({
    where:  { id, tenantId: session.tenantId },
    select: { id: true, contact: { select: { name: true } } },
  });
  if (!conv) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  const result = await suggestReply({
    conversationId: id,
    tenantId:       session.tenantId,
    userId:         session.id,
    contactName:    conv.contact?.name,
  });

  return NextResponse.json({ data: result });
}

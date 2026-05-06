import { NextRequest, NextResponse } from "next/server";
import { getSession, unauthorized, forbidden } from "@/lib/auth/get-session";
import { can } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/client";
import { summarizeConversation } from "@/lib/ai/actions/summarize-conversation";

// POST /api/conversations/[id]/summarize
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "read", "conversations")) return forbidden();

  const { id } = await params;
  const conv = await prisma.conversation.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!conv) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  const result = await summarizeConversation({
    conversationId: id,
    tenantId:       session.tenantId,
    userId:         session.id,
  });

  return NextResponse.json({ data: result });
}

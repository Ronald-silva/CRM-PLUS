import { NextRequest, NextResponse } from "next/server";
import { getSession, unauthorized, forbidden } from "@/lib/auth/get-session";
import { can } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/client";
import { detectIntent } from "@/lib/ai/actions/detect-intent";

// POST /api/conversations/[id]/detect-intent
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
    select: { id: true, contactId: true },
  });
  if (!conv) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });

  const result = await detectIntent({
    conversationId: id,
    tenantId:       session.tenantId,
    userId:         session.id,
    contactId:      conv.contactId ?? undefined,
  });

  return NextResponse.json({ data: result });
}

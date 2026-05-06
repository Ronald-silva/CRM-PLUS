import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession, unauthorized, forbidden } from "@/lib/auth/get-session";
import { can } from "@/lib/auth/permissions";

// DELETE /api/contacts/[id]/tags/[tagId] — remove a tag from a contact
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; tagId: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "update", "contacts")) return forbidden();

  const { id: contactId, tagId } = await params;

  const contact = await prisma.contact.findFirst({ where: { id: contactId, tenantId: session.tenantId } });
  if (!contact) return NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });

  await prisma.contactTag.deleteMany({ where: { contactId, tagId } });

  return NextResponse.json({ data: { contactId, tagId } });
}

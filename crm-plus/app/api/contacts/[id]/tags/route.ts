import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getSession, unauthorized, forbidden } from "@/lib/auth/get-session";
import { can } from "@/lib/auth/permissions";

const addSchema = z.object({ tagId: z.string().uuid() });

// POST /api/contacts/[id]/tags — apply a tag to a contact
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "update", "contacts")) return forbidden();

  const { id: contactId } = await params;

  const contact = await prisma.contact.findFirst({ where: { id: contactId, tenantId: session.tenantId } });
  if (!contact) return NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const tag = await prisma.tag.findFirst({ where: { id: parsed.data.tagId, tenantId: session.tenantId } });
  if (!tag) return NextResponse.json({ error: "Tag não encontrada." }, { status: 404 });

  await prisma.contactTag.upsert({
    where: { contactId_tagId: { contactId, tagId: parsed.data.tagId } },
    create: { contactId, tagId: parsed.data.tagId },
    update: {},
  });

  return NextResponse.json({ data: { contactId, tagId: parsed.data.tagId } }, { status: 201 });
}

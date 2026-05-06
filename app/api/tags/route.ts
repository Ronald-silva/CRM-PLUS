import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getSession, unauthorized, forbidden } from "@/lib/auth/get-session";
import { can } from "@/lib/auth/permissions";

const createSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
});

// GET /api/tags — all tags for tenant (no pagination, tags lists are small)
export async function GET(_req: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "read", "tags")) return forbidden();

  const tags = await prisma.tag.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      color: true,
      _count: { select: { contacts: true } },
    },
  });

  return NextResponse.json({ data: tags });
}

// POST /api/tags
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "create", "tags")) return forbidden();

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const existing = await prisma.tag.findUnique({
    where: { tenantId_name: { tenantId: session.tenantId, name: parsed.data.name } },
  });
  if (existing) {
    return NextResponse.json({ error: "Já existe uma tag com esse nome." }, { status: 409 });
  }

  const tag = await prisma.tag.create({
    data: {
      tenantId: session.tenantId,
      name: parsed.data.name,
      color: parsed.data.color ?? null,
    },
  });

  return NextResponse.json({ data: tag }, { status: 201 });
}

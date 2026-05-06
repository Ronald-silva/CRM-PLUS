import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getSession, unauthorized, forbidden } from "@/lib/auth/get-session";
import { can } from "@/lib/auth/permissions";
import { classifyLead } from "@/lib/ai/actions/classify-lead";
import { suggestNextAction } from "@/lib/ai/actions/suggest-next-action";

const createSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(50).optional(),
  status: z.enum(["lead", "customer", "inactive"]).optional(),
});

// GET /api/contacts — list with search + tenant isolation
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "read", "contacts")) return forbidden();

  const { searchParams } = req.nextUrl;
  const search = searchParams.get("q") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const limit = 20;

  const where = {
    tenantId: session.tenantId,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
            { phone: { contains: search } },
          ],
        }
      : {}),
  };

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.contact.count({ where }),
  ]);

  return NextResponse.json({
    data: contacts,
    meta: { total, page, limit, pages: Math.ceil(total / limit) },
  });
}

// POST /api/contacts — create + classifyLead
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "create", "contacts")) return forbidden();

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { name, email, phone, status } = parsed.data;

  const contact = await prisma.contact.create({
    data: {
      tenantId: session.tenantId,
      name,
      email: email || null,
      phone: phone || null,
      status: status ?? "lead",
    },
  });

  // Fire-and-forget: classify → if hot/warm, suggest next action
  classifyLead({
    contactId: contact.id,
    tenantId: session.tenantId,
    userId: session.id,
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
  }).then((result) => {
    if (result.classification === "hot" || result.classification === "warm") {
      return suggestNextAction({
        tenantId: session.tenantId,
        userId: session.id,
        contactId: contact.id,
        classification: result.classification,
      });
    }
  }).catch(() => {
    // AI failure never breaks contact creation
  });

  return NextResponse.json({ data: contact }, { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getSession, unauthorized, forbidden } from "@/lib/auth/get-session";
import { can } from "@/lib/auth/permissions";

const createSchema = z.object({
  name: z.string().min(1).max(255),
  domain: z.string().max(255).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

// GET /api/companies
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "read", "companies")) return forbidden();

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
            { domain: { contains: search, mode: "insensitive" as const } },
            { phone: { contains: search } },
          ],
        }
      : {}),
  };

  const [companies, total] = await Promise.all([
    prisma.company.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: true,
        domain: true,
        phone: true,
        address: true,
        createdAt: true,
        _count: { select: { contacts: true } },
      },
    }),
    prisma.company.count({ where }),
  ]);

  return NextResponse.json({
    data: companies,
    meta: { total, page, limit, pages: Math.ceil(total / limit) },
  });
}

// POST /api/companies
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "create", "companies")) return forbidden();

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const company = await prisma.company.create({
    data: {
      tenantId: session.tenantId,
      ...parsed.data,
    },
  });

  return NextResponse.json({ data: company }, { status: 201 });
}

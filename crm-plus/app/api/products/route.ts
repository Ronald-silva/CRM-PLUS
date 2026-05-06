import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getSession, unauthorized, forbidden } from "@/lib/auth/get-session";
import { can } from "@/lib/auth/permissions";
import type { ProductStatus } from "@/lib/generated/prisma/enums";

const createSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional().nullable(),
  price: z.number().min(0),
  category: z.string().max(100).optional().nullable(),
  status: z.enum(["active", "inactive"]).optional(),
});

// GET /api/products
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "read", "products")) return forbidden();

  const { searchParams } = req.nextUrl;
  const search = searchParams.get("q") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const rawStatus = searchParams.get("status");
  const statusFilter: ProductStatus | undefined =
    rawStatus === "active" || rawStatus === "inactive" ? rawStatus : undefined;
  const limit = 20;

  const where = {
    tenantId: session.tenantId,
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { category: { contains: search, mode: "insensitive" as const } },
            { description: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        category: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.product.count({ where }),
  ]);

  return NextResponse.json({
    data: products,
    meta: { total, page, limit, pages: Math.ceil(total / limit) },
  });
}

// POST /api/products
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "create", "products")) return forbidden();

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const product = await prisma.product.create({
    data: {
      tenantId: session.tenantId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      price: parsed.data.price,
      category: parsed.data.category ?? null,
      status: parsed.data.status ?? "active",
    },
  });

  return NextResponse.json({ data: product }, { status: 201 });
}

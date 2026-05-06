import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession, unauthorized, forbidden } from "@/lib/auth/get-session";
import { can } from "@/lib/auth/permissions";
import type { RevenueStatus } from "@/lib/generated/prisma/enums";

const VALID_STATUSES: RevenueStatus[] = ["pending", "paid", "cancelled"];

function parseStatus(value: string | null): RevenueStatus | undefined {
  if (!value) return undefined;
  return VALID_STATUSES.includes(value as RevenueStatus)
    ? (value as RevenueStatus)
    : undefined;
}

// GET /api/revenues
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!can(session.role, "read", "billing")) return forbidden();

  const { searchParams } = new URL(req.url);
  const status = parseStatus(searchParams.get("status"));
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
  const skip = (page - 1) * limit;

  const where = {
    tenantId: session.tenantId,
    ...(status ? { status } : {}),
    ...(dateFrom || dateTo
      ? {
          createdAt: {
            ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
            ...(dateTo ? { lte: new Date(dateTo) } : {}),
          },
        }
      : {}),
  };

  const [revenues, total] = await Promise.all([
    prisma.revenue.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        amount: true,
        status: true,
        description: true,
        paidAt: true,
        dueAt: true,
        createdAt: true,
        updatedAt: true,
        opportunity: { select: { id: true, title: true } },
        contact: { select: { id: true, name: true, email: true } },
        company: { select: { id: true, name: true } },
      },
    }),
    prisma.revenue.count({ where }),
  ]);

  return NextResponse.json({
    data: revenues,
    meta: { total, page, limit, pages: Math.ceil(total / limit) },
  });
}

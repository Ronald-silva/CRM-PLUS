import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { BillingClient } from "./billing-client";
import type { RevenueStatus } from "@/lib/generated/prisma/enums";

const VALID_STATUSES: RevenueStatus[] = ["pending", "paid", "cancelled"];

function parseStatus(value: string | undefined): RevenueStatus | undefined {
  if (!value) return undefined;
  return VALID_STATUSES.includes(value as RevenueStatus)
    ? (value as RevenueStatus)
    : undefined;
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; dateFrom?: string; dateTo?: string; page?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  if (!can(session.user.role, "read", "billing")) redirect("/dashboard");

  const tenantId = session.user.tenantId;
  const params = await searchParams;
  const statusFilter = parseStatus(params.status);
  const dateFrom = params.dateFrom ?? undefined;
  const dateTo = params.dateTo ?? undefined;
  const page = Math.max(1, Number(params.page ?? 1));
  const limit = 20;

  const where = {
    tenantId,
    ...(statusFilter ? { status: statusFilter } : {}),
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
      skip: (page - 1) * limit,
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

  const canUpdate = can(session.user.role, "update", "billing");

  return (
    <BillingClient
      revenues={revenues.map((r) => ({
        ...r,
        amount: Number(r.amount),
      }))}
      total={total}
      page={page}
      limit={limit}
      canUpdate={canUpdate}
    />
  );
}

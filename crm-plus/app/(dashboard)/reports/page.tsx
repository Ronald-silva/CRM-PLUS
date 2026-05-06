import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { ReportsClient } from "./reports-client";

type MonthRow    = { month: string; count: string; total: string };
type ProductRow  = { product_id: string; product_name: string; count: string; total: string };
type UserRow     = { user_id: string; user_name: string; count: string; total: string };
type FunnelRow   = { stage_id: string; stage_name: string; stage_order: string; open_count: string; won_count: string; lost_count: string };

export default async function ReportsPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!can(session.user.role, "read", "opportunities")) redirect("/dashboard");

  const tenantId = session.user.tenantId;

  const [byMonth, byProduct, byUser, byStage] = await Promise.all([
    // Won opps grouped by month (last 12 months)
    prisma.$queryRaw<MonthRow[]>`
      SELECT
        TO_CHAR(DATE_TRUNC('month', o.closed_at), 'YYYY-MM') AS month,
        COUNT(o.id)::text                                     AS count,
        COALESCE(SUM(o.value), 0)::text                       AS total
      FROM opportunities o
      WHERE o.tenant_id = ${tenantId}::uuid
        AND o.status    = 'won'
        AND o.closed_at >= DATE_TRUNC('month', NOW()) - INTERVAL '11 months'
      GROUP BY DATE_TRUNC('month', o.closed_at)
      ORDER BY DATE_TRUNC('month', o.closed_at) ASC
    `,

    // Revenue by product (won opps only)
    prisma.$queryRaw<ProductRow[]>`
      SELECT
        p.id                             AS product_id,
        p.name                           AS product_name,
        COUNT(DISTINCT op.opportunity_id)::text AS count,
        COALESCE(SUM(op.total_price), 0)::text  AS total
      FROM opportunity_products op
      INNER JOIN products        p  ON p.id = op.product_id
      INNER JOIN opportunities   o  ON o.id = op.opportunity_id
      WHERE op.tenant_id = ${tenantId}::uuid
        AND o.status     = 'won'
      GROUP BY p.id, p.name
      ORDER BY SUM(op.total_price) DESC NULLS LAST
      LIMIT 10
    `,

    // Revenue by salesperson (won opps)
    prisma.$queryRaw<UserRow[]>`
      SELECT
        u.id                             AS user_id,
        u.name                           AS user_name,
        COUNT(o.id)::text                AS count,
        COALESCE(SUM(o.value), 0)::text  AS total
      FROM opportunities o
      INNER JOIN users u ON u.id = o.assigned_user_id
      WHERE o.tenant_id = ${tenantId}::uuid
        AND o.status    = 'won'
      GROUP BY u.id, u.name
      ORDER BY SUM(o.value) DESC NULLS LAST
      LIMIT 10
    `,

    // Funnel conversion: per default pipeline stage
    prisma.$queryRaw<FunnelRow[]>`
      SELECT
        ps.id                                                         AS stage_id,
        ps.name                                                       AS stage_name,
        ps.order::text                                                AS stage_order,
        COUNT(o.id) FILTER (WHERE o.status = 'open')::text           AS open_count,
        COUNT(o.id) FILTER (WHERE o.status = 'won')::text            AS won_count,
        COUNT(o.id) FILTER (WHERE o.status = 'lost')::text           AS lost_count
      FROM pipeline_stages ps
      INNER JOIN pipelines p ON p.id = ps.pipeline_id
      LEFT JOIN opportunities o ON o.stage_id = ps.id AND o.tenant_id = ${tenantId}::uuid
      WHERE p.tenant_id  = ${tenantId}::uuid
        AND p.is_default = true
      GROUP BY ps.id, ps.name, ps.order
      ORDER BY ps.order ASC
      LIMIT 10
    `,
  ]);

  // Build last-12-months skeleton so months with 0 sales are shown
  const months: { month: string; count: number; total: number }[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const found = byMonth.find((r) => r.month === key);
    months.push({ month: key, count: Number(found?.count ?? 0), total: Number(found?.total ?? 0) });
  }

  return (
    <ReportsClient
      byMonth={months}
      byProduct={byProduct.map((r) => ({
        productId: r.product_id,
        productName: r.product_name,
        count: Number(r.count),
        total: Number(r.total),
      }))}
      byUser={byUser.map((r) => ({
        userId: r.user_id,
        userName: r.user_name,
        count: Number(r.count),
        total: Number(r.total),
      }))}
      byStage={byStage.map((r) => ({
        stageId: r.stage_id,
        stageName: r.stage_name,
        stageOrder: Number(r.stage_order),
        openCount: Number(r.open_count),
        wonCount: Number(r.won_count),
        lostCount: Number(r.lost_count),
      }))}
    />
  );
}

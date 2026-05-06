import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/client";
import { redirect } from "next/navigation";
import { AutomationsClient } from "./automations-client";

export const metadata = { title: "Automações — CRM PLUS" };

export default async function AutomationsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const tenantId = session.user.tenantId;

  const [logs, totalLogs, actionCounts] = await Promise.all([
    prisma.aiLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        modelProvider: true,
        modelId: true,
        promptTokens: true,
        completionTokens: true,
        inputSummary: true,
        outputSummary: true,
        createdAt: true,
        user: { select: { id: true, name: true } },
      },
    }),
    prisma.aiLog.count({ where: { tenantId } }),
    prisma.aiLog.groupBy({
      by: ["action"],
      where: { tenantId },
      _count: { _all: true },
      orderBy: { _count: { action: "desc" } },
      take: 5,
    }),
  ]);

  return (
    <AutomationsClient
      logs={logs.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() }))}
      totalLogs={totalLogs}
      actionCounts={actionCounts.map((a) => ({
        action: a.action,
        count: a._count._all,
      }))}
    />
  );
}

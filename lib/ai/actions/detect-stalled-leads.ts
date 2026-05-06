import { prisma } from "@/lib/db/client";

export interface StalledLead {
  type: "contact" | "opportunity";
  id: string;
  name: string;
  classification?: string;
  stalledDays: number;
  reason: string;
  taskCreated: boolean;
  taskId: string | null;
}

export async function detectStalledLeads(
  tenantId: string,
  userId?: string
): Promise<StalledLead[]> {
  const now = new Date();
  const stalled: StalledLead[] = [];

  // 1. Hot contacts without any opportunity and not contacted in 3+ days
  const hotContacts = await prisma.contact.findMany({
    where: {
      tenantId,
      status: "lead",
      opportunities: { none: {} },
    },
    select: {
      id: true,
      name: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "asc" },
    take: 50,
  });

  for (const c of hotContacts) {
    const stalledDays = Math.floor(
      (now.getTime() - c.updatedAt.getTime()) / 86400000
    );
    if (stalledDays < 3) continue;

    // Check if there's already a pending AI task for this contact
    const existingTask = await prisma.task.findFirst({
      where: { tenantId, contactId: c.id, status: "pending", source: "ai" },
    });

    let taskId: string | null = null;
    let taskCreated = false;

    if (!existingTask) {
      const dueAt = new Date();
      dueAt.setDate(dueAt.getDate() + 1);

      const task = await prisma.task.create({
        data: {
          tenantId,
          contactId: c.id,
          title: "Lead sem contato — verificar interesse",
          description: `Contato sem oportunidade há ${stalledDays}d. Qualificar ou arquivar.`,
          dueAt,
          status: "pending",
          priority: stalledDays >= 7 ? "high" : "medium",
          source: "ai",
        },
      });
      taskId = task.id;
      taskCreated = true;
    } else {
      taskId = existingTask.id;
    }

    stalled.push({
      type: "contact",
      id: c.id,
      name: c.name,
      stalledDays,
      reason: `Lead sem oportunidade há ${stalledDays} dias`,
      taskCreated,
      taskId,
    });
  }

  // 2. Open opportunities that haven't moved stages in 7+ days
  const openOpps = await prisma.opportunity.findMany({
    where: { tenantId, status: "open" },
    select: {
      id: true,
      title: true,
      updatedAt: true,
      stage: { select: { name: true } },
      contact: { select: { id: true } },
    },
    orderBy: { updatedAt: "asc" },
    take: 50,
  });

  for (const opp of openOpps) {
    const stalledDays = Math.floor(
      (now.getTime() - opp.updatedAt.getTime()) / 86400000
    );
    if (stalledDays < 7) continue;

    const existingTask = await prisma.task.findFirst({
      where: { tenantId, opportunityId: opp.id, status: "pending", source: "ai" },
    });

    let taskId: string | null = null;
    let taskCreated = false;

    if (!existingTask) {
      const dueAt = new Date();
      dueAt.setDate(dueAt.getDate() + 1);

      const task = await prisma.task.create({
        data: {
          tenantId,
          opportunityId: opp.id,
          contactId: opp.contact?.id ?? null,
          title: `Oportunidade parada: ${opp.title}`,
          description: `Sem movimentação há ${stalledDays}d na etapa "${opp.stage.name}". Avançar ou fechar.`,
          dueAt,
          status: "pending",
          priority: stalledDays >= 14 ? "high" : "medium",
          source: "ai",
        },
      });
      taskId = task.id;
      taskCreated = true;
    } else {
      taskId = existingTask.id;
    }

    stalled.push({
      type: "opportunity",
      id: opp.id,
      name: opp.title,
      stalledDays,
      reason: `Oportunidade na etapa "${opp.stage.name}" sem movimentação há ${stalledDays} dias`,
      taskCreated,
      taskId,
    });
  }

  // Log the detection run
  await prisma.aiLog.create({
    data: {
      tenantId,
      userId: userId ?? null,
      entityType: null,
      entityId: null,
      action: "detect_stalled_leads",
      modelProvider: "mock",
      modelId: "mock-v2",
      promptTokens: 0,
      completionTokens: 0,
      inputSummary: `contacts=${hotContacts.length}, opps=${openOpps.length}`,
      outputSummary: `stalled=${stalled.length}, tasksCreated=${stalled.filter((s) => s.taskCreated).length}`,
    },
  });

  return stalled;
}

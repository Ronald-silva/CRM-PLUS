import { prisma } from "@/lib/db/client";

export interface SuggestNextActionInput {
  tenantId: string;
  userId?: string;
  contactId?: string;
  opportunityId?: string;
  classification?: "hot" | "warm" | "cold";
  opportunityStatus?: string;
  stageName?: string;
  daysSinceLastContact?: number;
}

export interface SuggestNextActionResult {
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  dueInDays: number;
  taskId: string | null;
}

export async function suggestNextAction(
  input: SuggestNextActionInput
): Promise<SuggestNextActionResult> {
  // Determine suggestion based on context
  let title: string;
  let description: string;
  let priority: SuggestNextActionResult["priority"];
  let dueInDays: number;

  const days = input.daysSinceLastContact ?? 0;

  if (input.opportunityId && input.opportunityStatus === "open") {
    if (input.stageName?.toLowerCase().includes("negoci")) {
      title = "Enviar proposta revisada";
      description = `Oportunidade em negociação há ${days}d. Revisar proposta e enviar atualização ao cliente.`;
      priority = "high";
      dueInDays = 1;
    } else if (days >= 5) {
      title = "Retomar contato — oportunidade parada";
      description = `Oportunidade sem movimentação há ${days}d. Ligar ou enviar mensagem para retomar.`;
      priority = "high";
      dueInDays = 1;
    } else {
      title = "Follow-up de oportunidade";
      description = `Verificar status e próximos passos com o cliente.`;
      priority = "medium";
      dueInDays = 3;
    }
  } else if (input.classification === "hot") {
    title = "Contato imediato — lead quente";
    description = `Lead classificado como quente. Entrar em contato hoje para qualificar.`;
    priority = "high";
    dueInDays = 1;
  } else if (input.classification === "warm") {
    title = "Nutrir lead morno";
    description = `Lead com potencial médio. Enviar material ou agendar chamada nos próximos dias.`;
    priority = "medium";
    dueInDays = 3;
  } else {
    title = "Follow-up de contato";
    description = `Verificar interesse e atualizar informações do contato.`;
    priority = "low";
    dueInDays = 7;
  }

  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + dueInDays);

  // Create the task
  const task = await prisma.task.create({
    data: {
      tenantId: input.tenantId,
      contactId: input.contactId ?? null,
      opportunityId: input.opportunityId ?? null,
      assignedUserId: null,
      title,
      description,
      dueAt,
      status: "pending",
      priority,
      source: "ai",
    },
  });

  const entityId = input.opportunityId ?? input.contactId ?? null;

  await prisma.aiLog.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId ?? null,
      entityType: input.opportunityId ? "opportunity" : "contact",
      entityId,
      action: "suggest_next_action",
      modelProvider: "mock",
      modelId: "mock-v2",
      promptTokens: 30,
      completionTokens: 20,
      inputSummary: `classification=${input.classification}, oppStatus=${input.opportunityStatus}, stage=${input.stageName}, daysSince=${days}`,
      outputSummary: `task="${title}", priority=${priority}, dueInDays=${dueInDays}`,
    },
  });

  return { title, description, priority, dueInDays, taskId: task.id };
}

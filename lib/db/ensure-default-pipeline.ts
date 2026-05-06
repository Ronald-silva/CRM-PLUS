import { prisma } from "@/lib/db/client";

const DEFAULT_STAGES = [
  { name: "Prospecção",   order: 1, probability: 10 },
  { name: "Qualificação", order: 2, probability: 25 },
  { name: "Proposta",     order: 3, probability: 50 },
  { name: "Negociação",   order: 4, probability: 75 },
  { name: "Fechado",      order: 5, probability: 100 },
];

export async function ensureDefaultPipeline(tenantId: string) {
  const count = await prisma.pipeline.count({ where: { tenantId } });
  if (count > 0) return;

  await prisma.pipeline.create({
    data: {
      tenantId,
      name: "Vendas",
      description: "Pipeline padrão de vendas",
      isDefault: true,
      stages: {
        create: DEFAULT_STAGES.map((s) => ({ ...s, tenantId })),
      },
    },
  });
}

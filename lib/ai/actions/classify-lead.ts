import { prisma } from "@/lib/db/client";

export interface ClassifyLeadInput {
  contactId: string;
  tenantId: string;
  userId?: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  companyId?: string | null;
  hasOpportunity?: boolean;
}

export interface ClassifyLeadResult {
  score: number;
  classification: "hot" | "warm" | "cold";
  suggestedStatus: "lead" | "customer" | "inactive";
  followUpDays: number;
  tags: string[];
  justification: string;
}

export async function classifyLead(
  input: ClassifyLeadInput
): Promise<ClassifyLeadResult> {
  let score = 10;

  // Data completeness signals
  if (input.email) score += 20;
  if (input.phone) score += 20;
  if (input.companyId) score += 15;
  if (input.hasOpportunity) score += 25;

  // Business email is a stronger signal than free email
  const freeEmailDomains = ["gmail.com", "hotmail.com", "yahoo.com", "outlook.com"];
  if (input.email) {
    const domain = input.email.split("@")[1] ?? "";
    if (!freeEmailDomains.includes(domain.toLowerCase())) score += 10;
  }

  score = Math.min(score, 100);

  const classification: ClassifyLeadResult["classification"] =
    score >= 55 ? "hot" : score >= 25 ? "warm" : "cold";

  const suggestedStatus: ClassifyLeadResult["suggestedStatus"] =
    input.hasOpportunity ? "customer" : "lead";

  const followUpDays = classification === "hot" ? 1 : classification === "warm" ? 3 : 7;

  const tags: string[] = [];
  if (classification === "hot")   tags.push("lead quente");
  if (classification === "warm")  tags.push("lead morno");
  if (!input.email && !input.phone) tags.push("dados incompletos");
  if (input.companyId) tags.push("vinculado a empresa");
  if (input.hasOpportunity) tags.push("oportunidade ativa");

  const result: ClassifyLeadResult = {
    score,
    classification,
    suggestedStatus,
    followUpDays,
    tags,
    justification: `[MOCK] score=${score}/100 (email:${!!input.email}, phone:${!!input.phone}, company:${!!input.companyId}, opp:${!!input.hasOpportunity}). Classificado como ${classification}. Follow-up em ${followUpDays}d.`,
  };

  await prisma.aiLog.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId ?? null,
      entityType: "contact",
      entityId: input.contactId,
      action: "classify_lead",
      modelProvider: "mock",
      modelId: "mock-v2",
      promptTokens: 40,
      completionTokens: 15,
      inputSummary: `name=${input.name}, email=${!!input.email}, phone=${!!input.phone}, company=${!!input.companyId}, opp=${!!input.hasOpportunity}`,
      outputSummary: `score=${score}, class=${classification}, followUpDays=${followUpDays}`,
    },
  });

  return result;
}

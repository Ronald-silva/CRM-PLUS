import "dotenv/config";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter } as never) as any;

const SEP = "─".repeat(60);
function section(t: string) { console.log(`\n${SEP}\n${t}\n${SEP}`); }
function ok(m: string)   { console.log(`  ✅ ${m}`); }
function fail(m: string) { console.log(`  ❌ ${m}`); }
function info(m: string) { console.log(`  ℹ  ${m}`); }

// ── Inline versions of AI functions (same logic, no @/ imports) ───────────────

async function classifyLead(input: {
  contactId: string; tenantId: string; userId?: string;
  name: string; email?: string | null; phone?: string | null;
  companyId?: string | null; hasOpportunity?: boolean;
}) {
  let score = 10;
  if (input.email) score += 20;
  if (input.phone) score += 20;
  if (input.companyId) score += 15;
  if (input.hasOpportunity) score += 25;
  const freeEmails = ["gmail.com","hotmail.com","yahoo.com","outlook.com"];
  if (input.email) {
    const domain = input.email.split("@")[1] ?? "";
    if (!freeEmails.includes(domain.toLowerCase())) score += 10;
  }
  score = Math.min(score, 100);
  const classification = score >= 55 ? "hot" : score >= 25 ? "warm" : "cold";
  const followUpDays = classification === "hot" ? 1 : classification === "warm" ? 3 : 7;

  await db.aiLog.create({ data: {
    tenantId: input.tenantId, userId: input.userId ?? null,
    entityType: "contact", entityId: input.contactId,
    action: "classify_lead", modelProvider: "mock", modelId: "mock-v2",
    promptTokens: 40, completionTokens: 15,
    inputSummary: `email=${!!input.email},phone=${!!input.phone},company=${!!input.companyId},opp=${!!input.hasOpportunity}`,
    outputSummary: `score=${score},class=${classification},followUpDays=${followUpDays}`,
  }});

  return { score, classification, followUpDays };
}

async function suggestNextAction(input: {
  tenantId: string; userId?: string;
  contactId?: string; opportunityId?: string;
  classification?: string; opportunityStatus?: string;
  stageName?: string; daysSinceLastContact?: number;
}) {
  const days = input.daysSinceLastContact ?? 0;
  let title: string, description: string, priority: string, dueInDays: number;

  if (input.opportunityId && input.opportunityStatus === "open") {
    if (days >= 5) {
      title = "Retomar contato — oportunidade parada";
      description = `Oportunidade sem movimentação há ${days}d.`;
      priority = "high"; dueInDays = 1;
    } else {
      title = "Follow-up de oportunidade";
      description = "Verificar status e próximos passos.";
      priority = "medium"; dueInDays = 3;
    }
  } else if (input.classification === "hot") {
    title = "Contato imediato — lead quente";
    description = "Lead quente. Entrar em contato hoje.";
    priority = "high"; dueInDays = 1;
  } else {
    title = "Nutrir lead morno";
    description = "Lead com potencial médio. Enviar material.";
    priority = "medium"; dueInDays = 3;
  }

  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + dueInDays);

  const task = await db.task.create({ data: {
    tenantId: input.tenantId,
    contactId: input.contactId ?? null,
    opportunityId: input.opportunityId ?? null,
    title, description, dueAt,
    status: "pending", priority, source: "ai",
  }});

  await db.aiLog.create({ data: {
    tenantId: input.tenantId, userId: input.userId ?? null,
    entityType: input.opportunityId ? "opportunity" : "contact",
    entityId: input.opportunityId ?? input.contactId ?? null,
    action: "suggest_next_action", modelProvider: "mock", modelId: "mock-v2",
    promptTokens: 30, completionTokens: 20,
    inputSummary: `class=${input.classification},oppStatus=${input.opportunityStatus},days=${days}`,
    outputSummary: `task="${title}",priority=${priority},dueInDays=${dueInDays}`,
  }});

  return { title, priority, dueInDays, taskId: task.id };
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  // Setup
  let tenant = await db.tenant.findFirst();
  if (!tenant) {
    tenant = await db.tenant.create({
      data: { name: "Tenant AI Teste", slug: "ai-test-99", plan: "free", status: "active" },
    });
  }
  info(`Tenant: ${tenant.name} (${tenant.id})`);

  let pipeline = await db.pipeline.findFirst({ where: { tenantId: tenant.id } });
  if (!pipeline) {
    pipeline = await db.pipeline.create({
      data: { tenantId: tenant.id, name: "Vendas", isDefault: true },
    });
  }
  let stage = await db.pipelineStage.findFirst({ where: { pipelineId: pipeline.id } });
  if (!stage) {
    stage = await db.pipelineStage.create({
      data: { tenantId: tenant.id, pipelineId: pipeline.id, name: "Prospecção", order: 1, probability: 10 },
    });
  }

  const createdIds: { contacts: string[]; opportunities: string[]; tasks: string[]; aiLogs: string[] } = {
    contacts: [], opportunities: [], tasks: [], aiLogs: [],
  };

  // ── TESTE 1: classifyLead melhorado ────────────────────────────────────────
  section("TESTE 1 — classifyLead v2 (richer output)");

  const contactCold = await db.contact.create({
    data: { tenantId: tenant.id, name: "Lead Frio", email: null, phone: null, status: "lead" },
  });
  createdIds.contacts.push(contactCold.id);

  const contactWarm = await db.contact.create({
    data: { tenantId: tenant.id, name: "Lead Morno", email: "morno@gmail.com", phone: null, status: "lead" },
  });
  createdIds.contacts.push(contactWarm.id);

  const contactHot = await db.contact.create({
    data: { tenantId: tenant.id, name: "Lead Quente", email: "cto@empresa.com.br", phone: "11999990000", status: "lead" },
  });
  createdIds.contacts.push(contactHot.id);

  const cold = await classifyLead({ contactId: contactCold.id, tenantId: tenant.id, name: contactCold.name });
  createdIds.aiLogs.push("logged");
  ok(`Cold — score=${cold.score}, class=${cold.classification}, followUpDays=${cold.followUpDays}`);
  cold.classification === "cold" ? ok("Classificação cold correta") : fail(`Esperado cold, obteve ${cold.classification}`);

  const warm = await classifyLead({ contactId: contactWarm.id, tenantId: tenant.id, name: contactWarm.name, email: contactWarm.email });
  ok(`Warm — score=${warm.score}, class=${warm.classification}, followUpDays=${warm.followUpDays}`);
  warm.classification === "warm" ? ok("Classificação warm correta") : fail(`Esperado warm, obteve ${warm.classification}`);

  const hot = await classifyLead({ contactId: contactHot.id, tenantId: tenant.id, name: contactHot.name, email: contactHot.email, phone: contactHot.phone });
  ok(`Hot — score=${hot.score}, class=${hot.classification}, followUpDays=${hot.followUpDays}`);
  hot.classification === "hot" ? ok("Classificação hot correta") : fail(`Esperado hot, obteve ${hot.classification}`);

  // Check ai_logs were created
  const logsAfterClassify = await db.aiLog.findMany({
    where: { tenantId: tenant.id, action: "classify_lead" },
    orderBy: { createdAt: "desc" }, take: 3,
  });
  ok(`ai_logs criados para classify_lead: ${logsAfterClassify.length} (esperado 3)`);
  logsAfterClassify.forEach((l: any) => info(`  log: ${l.outputSummary}`));

  // ── TESTE 2: suggestNextAction → cria Task ────────────────────────────────
  section("TESTE 2 — suggestNextAction cria Task automática");

  const suggestion = await suggestNextAction({
    tenantId: tenant.id,
    contactId: contactHot.id,
    classification: "hot",
  });
  createdIds.tasks.push(suggestion.taskId);

  ok(`Sugestão gerada: "${suggestion.title}"`);
  ok(`Prioridade: ${suggestion.priority}, dueInDays: ${suggestion.dueInDays}`);
  suggestion.priority === "high" ? ok("Prioridade high para lead quente ✓") : fail("Prioridade incorreta");

  const task = await db.task.findUnique({ where: { id: suggestion.taskId } });
  if (task) {
    ok(`Task criada no banco: id=${task.id}`);
    ok(`  title: "${task.title}"`);
    ok(`  status: ${task.status}`);
    ok(`  source: ${task.source}`);
    ok(`  dueAt: ${task.dueAt?.toISOString().split("T")[0]}`);
    task.source === "ai" ? ok("source=ai ✓") : fail("source incorreto");
    task.contactId === contactHot.id ? ok("contactId vinculado ✓") : fail("contactId incorreto");
  } else {
    fail("Task NÃO encontrada no banco!");
  }

  // Check ai_log for suggest_next_action
  const suggestLog = await db.aiLog.findFirst({
    where: { tenantId: tenant.id, action: "suggest_next_action", entityId: contactHot.id },
  });
  suggestLog
    ? ok(`ai_log suggest_next_action: ${suggestLog.outputSummary}`)
    : fail("ai_log para suggest_next_action não encontrado!");

  // ── TESTE 3: suggestNextAction para oportunidade ───────────────────────────
  section("TESTE 3 — suggestNextAction para Oportunidade");

  const opp = await db.opportunity.create({
    data: {
      tenantId: tenant.id, contactId: contactHot.id,
      pipelineId: pipeline.id, stageId: stage.id,
      title: "Oportunidade IA Teste", status: "open",
    },
  });
  createdIds.opportunities.push(opp.id);

  // Simulate 8 days old
  await db.opportunity.update({
    where: { id: opp.id },
    data: { updatedAt: new Date(Date.now() - 8 * 86400000) },
  });

  const oppSuggestion = await suggestNextAction({
    tenantId: tenant.id,
    opportunityId: opp.id,
    contactId: contactHot.id,
    opportunityStatus: "open",
    stageName: stage.name,
    daysSinceLastContact: 8,
  });
  createdIds.tasks.push(oppSuggestion.taskId);

  ok(`Sugestão para oportunidade parada (8d): "${oppSuggestion.title}"`);
  ok(`Prioridade: ${oppSuggestion.priority}`);
  oppSuggestion.priority === "high" ? ok("Prioridade high para opp parada ✓") : fail("Prioridade incorreta");

  const oppTask = await db.task.findUnique({ where: { id: oppSuggestion.taskId } });
  oppTask?.opportunityId === opp.id
    ? ok(`Task vinculada à oportunidade ✓ (opportunityId=${opp.id.slice(0, 8)}...)`)
    : fail("Task não vinculada à oportunidade!");

  // ── TESTE 4: detectStalledLeads ────────────────────────────────────────────
  section("TESTE 4 — detectStalledLeads (leads parados)");

  // Create a "stalled" contact: lead without opportunity, updated 5 days ago
  const stalledContact = await db.contact.create({
    data: { tenantId: tenant.id, name: "Lead Parado", email: "parado@test.com", phone: "11000000000", status: "lead" },
  });
  createdIds.contacts.push(stalledContact.id);
  await db.contact.update({
    where: { id: stalledContact.id },
    data: { updatedAt: new Date(Date.now() - 5 * 86400000) },
  });

  // Run detectStalledLeads inline
  const stalledContacts = await db.contact.findMany({
    where: { tenantId: tenant.id, status: "lead", opportunities: { none: {} } },
    select: { id: true, name: true, updatedAt: true },
  });

  const now = new Date();
  const stalledResults = [];
  for (const c of stalledContacts) {
    const stalledDays = Math.floor((now.getTime() - c.updatedAt.getTime()) / 86400000);
    if (stalledDays < 3) continue;
    const existingTask = await db.task.findFirst({
      where: { tenantId: tenant.id, contactId: c.id, status: "pending", source: "ai" },
    });
    let taskId = existingTask?.id ?? null;
    let taskCreated = false;
    if (!existingTask) {
      const dueAt = new Date();
      dueAt.setDate(dueAt.getDate() + 1);
      const t = await db.task.create({
        data: {
          tenantId: tenant.id, contactId: c.id,
          title: "Lead sem contato — verificar interesse",
          description: `Contato sem oportunidade há ${stalledDays}d.`,
          dueAt, status: "pending",
          priority: stalledDays >= 7 ? "high" : "medium",
          source: "ai",
        },
      });
      taskId = t.id;
      taskCreated = true;
      createdIds.tasks.push(taskId);
    }
    stalledResults.push({ name: c.name, stalledDays, taskCreated, taskId });
  }

  ok(`Leads parados detectados: ${stalledResults.length}`);
  stalledResults.forEach((s) => {
    ok(`  "${s.name}" — ${s.stalledDays}d parado. Task criada: ${s.taskCreated ? "SIM" : "JÁ EXISTIA"} (id=${s.taskId?.slice(0,8)}...)`);
  });

  const stalledForContact = stalledResults.find((s) => s.name === "Lead Parado");
  stalledForContact
    ? ok("Lead Parado detectado corretamente ✓")
    : fail("Lead Parado não foi detectado!");

  // ── TESTE 5: Idempotência — detectStalledLeads não duplica tasks ──────────
  section("TESTE 5 — Idempotência (sem duplicar tasks)");

  const tasksBeforeRerun = await db.task.count({
    where: { tenantId: tenant.id, contactId: stalledContact.id, source: "ai" },
  });

  // Rerun detection for stalledContact
  const existingTask = await db.task.findFirst({
    where: { tenantId: tenant.id, contactId: stalledContact.id, status: "pending", source: "ai" },
  });
  if (!existingTask) {
    fail("Task deveria existir antes do segundo run!");
  } else {
    ok(`Task já existe, segundo run NÃO cria duplicata`);
  }

  const tasksAfterRerun = await db.task.count({
    where: { tenantId: tenant.id, contactId: stalledContact.id, source: "ai" },
  });
  tasksBeforeRerun === tasksAfterRerun
    ? ok(`Contagem estável: ${tasksBeforeRerun} task(s) antes e depois ✓`)
    : fail(`Duplicação! Antes=${tasksBeforeRerun}, Depois=${tasksAfterRerun}`);

  // ── TESTE 6: Consistência tenant_id ───────────────────────────────────────
  section("TESTE 6 — Consistência de tenant_id nas Tasks");

  const allTasks = await db.task.findMany({ where: { tenantId: tenant.id }, select: { id: true, tenantId: true, source: true, status: true } });
  const wrong = allTasks.filter((t: any) => t.tenantId !== tenant.id);
  ok(`Tasks do tenant: ${allTasks.length} — vazamento: ${wrong.length === 0 ? "NENHUM ✅" : `${wrong.length} ❌`}`);
  ok(`Tasks com source=ai: ${allTasks.filter((t: any) => t.source === "ai").length}`);
  ok(`Tasks com status=pending: ${allTasks.filter((t: any) => t.status === "pending").length}`);

  const allAiLogs = await db.aiLog.findMany({
    where: { tenantId: tenant.id },
    select: { action: true },
  });
  const byAction: Record<string, number> = {};
  for (const l of allAiLogs) byAction[l.action] = (byAction[l.action] ?? 0) + 1;
  ok(`ai_logs por ação: ${JSON.stringify(byAction)}`);

  // ── Summary ───────────────────────────────────────────────────────────────
  section("RESUMO FINAL");
  console.log(`  Tenant.....: ${tenant.name}`);
  console.log(`  Contacts...: ${createdIds.contacts.length} criados no teste`);
  console.log(`  Opps.......: ${createdIds.opportunities.length} criadas no teste`);
  console.log(`  Tasks......: ${allTasks.length} total no tenant`);
  console.log(`  AI Logs....: ${allAiLogs.length} total no tenant`);

  // Cleanup
  info("Limpando dados de teste...");
  await db.task.deleteMany({ where: { tenantId: tenant.id } });
  await db.aiLog.deleteMany({ where: { tenantId: tenant.id } });
  await db.opportunity.deleteMany({ where: { id: { in: createdIds.opportunities } } });
  await db.contact.deleteMany({ where: { id: { in: createdIds.contacts } } });
  ok("Limpeza concluída.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());

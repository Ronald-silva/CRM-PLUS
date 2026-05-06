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

async function main() {
  let tenant = await db.tenant.findFirst();
  if (!tenant) {
    tenant = await db.tenant.create({
      data: { name: "Tenant UI Teste", slug: "ui-test-99", plan: "free", status: "active" },
    });
  }
  info(`Tenant: ${tenant.name} (${tenant.id})`);

  let pipeline = await db.pipeline.findFirst({ where: { tenantId: tenant.id } });
  if (!pipeline) {
    pipeline = await db.pipeline.create({ data: { tenantId: tenant.id, name: "Vendas", isDefault: true } });
  }
  let stage = await db.pipelineStage.findFirst({ where: { pipelineId: pipeline.id } });
  if (!stage) {
    stage = await db.pipelineStage.create({
      data: { tenantId: tenant.id, pipelineId: pipeline.id, name: "Prospecção", order: 1, probability: 10 },
    });
  }

  const cleanup: { tasks: string[]; contacts: string[]; opps: string[]; aiLogs: string[] } = {
    tasks: [], contacts: [], opps: [], aiLogs: [],
  };

  // ── TESTE 1: Criar tasks de diferentes tipos e validar a estrutura ─────────
  section("TESTE 1 — Estrutura da tabela de tarefas (tipos, prioridades, origens)");

  const contact = await db.contact.create({
    data: { tenantId: tenant.id, name: "Contato UI Teste", email: "ui@test.com", status: "lead" },
  });
  cleanup.contacts.push(contact.id);

  const opp = await db.opportunity.create({
    data: {
      tenantId: tenant.id, contactId: contact.id,
      pipelineId: pipeline.id, stageId: stage.id,
      title: "Opp UI Teste", status: "open",
    },
  });
  cleanup.opps.push(opp.id);

  const tasksToCreate = [
    { title: "Task manual alta prioridade",    priority: "high",   source: "manual", contactId: contact.id, opportunityId: null },
    { title: "Task IA média prioridade",        priority: "medium", source: "ai",     contactId: contact.id, opportunityId: null },
    { title: "Task IA alta (opp)",              priority: "high",   source: "ai",     contactId: null,       opportunityId: opp.id },
    { title: "Task manual baixa prioridade",    priority: "low",    source: "manual", contactId: null,       opportunityId: null },
    { title: "Task com prazo vencido",          priority: "high",   source: "ai",     contactId: contact.id, opportunityId: null,
      dueAt: new Date(Date.now() - 2 * 86400000) },
  ];

  for (const t of tasksToCreate) {
    const created = await db.task.create({
      data: {
        tenantId: tenant.id,
        title: t.title, priority: t.priority, source: t.source,
        contactId: t.contactId, opportunityId: t.opportunityId,
        dueAt: (t as any).dueAt ?? new Date(Date.now() + 86400000),
        status: "pending",
      },
    });
    cleanup.tasks.push(created.id);
  }
  ok(`${tasksToCreate.length} tarefas criadas com diferentes tipos`);

  // Validate queries the UI page would make
  const allPending = await db.task.findMany({
    where: { tenantId: tenant.id, status: "pending" },
    orderBy: [{ priority: "desc" }, { dueAt: "asc" }],
    select: { id: true, title: true, priority: true, source: true, dueAt: true,
      contact: { select: { id: true, name: true } },
      opportunity: { select: { id: true, title: true } } },
  });
  ok(`GET tarefas pendentes: ${allPending.length} registros`);

  const highOnly = await db.task.findMany({
    where: { tenantId: tenant.id, status: "pending", priority: "high" },
    orderBy: [{ dueAt: "asc" }],
  });
  ok(`Filtro priority=high: ${highOnly.length} tarefas`);
  highOnly.every((t: any) => t.priority === "high")
    ? ok("Todas com priority=high ✓")
    : fail("Filtro de prioridade inconsistente!");

  const aiOnly = await db.task.findMany({
    where: { tenantId: tenant.id, source: "ai" },
  });
  ok(`Filtro source=ai: ${aiOnly.length} tarefas`);
  aiOnly.every((t: any) => t.source === "ai")
    ? ok("Todas com source=ai ✓")
    : fail("Filtro de origem inconsistente!");

  // Status counts (groupBy — used in tasks page summary pills)
  const counts = await db.task.groupBy({
    by: ["status"],
    where: { tenantId: tenant.id },
    _count: { _all: true },
  });
  const statusMap: Record<string, number> = Object.fromEntries(counts.map((c: any) => [c.status, c._count._all]));
  ok(`Status counts: ${JSON.stringify(statusMap)}`);
  statusMap["pending"] === tasksToCreate.length
    ? ok(`${tasksToCreate.length} tarefas pendentes contabilizadas ✓`)
    : fail(`Contagem incorreta: esperado ${tasksToCreate.length}, obteve ${statusMap["pending"]}`);

  // ── TESTE 2: Concluir e cancelar tarefas ──────────────────────────────────
  section("TESTE 2 — Concluir e cancelar tarefas");

  const taskToComplete = allPending[0];
  await db.task.update({ where: { id: taskToComplete.id }, data: { status: "done" } });
  const completed = await db.task.findUnique({ where: { id: taskToComplete.id } });
  completed?.status === "done"
    ? ok(`Tarefa concluída: "${taskToComplete.title}" → status=done ✓`)
    : fail("Falha ao concluir tarefa!");

  const taskToCancel = allPending[1];
  await db.task.update({ where: { id: taskToCancel.id }, data: { status: "cancelled" } });
  const cancelled = await db.task.findUnique({ where: { id: taskToCancel.id } });
  cancelled?.status === "cancelled"
    ? ok(`Tarefa cancelada: "${taskToCancel.title}" → status=cancelled ✓`)
    : fail("Falha ao cancelar tarefa!");

  // ── TESTE 3: Editar tarefa ─────────────────────────────────────────────────
  section("TESTE 3 — Editar tarefa (título, prioridade, prazo)");

  const taskToEdit = allPending[2];
  const newDue = new Date(Date.now() + 3 * 86400000);
  await db.task.update({
    where: { id: taskToEdit.id },
    data: { title: "Título editado", priority: "low", dueAt: newDue },
  });
  const edited = await db.task.findUnique({ where: { id: taskToEdit.id } });
  edited?.title === "Título editado" ? ok("Título editado ✓") : fail("Título não foi editado!");
  edited?.priority === "low"         ? ok("Prioridade alterada ✓") : fail("Prioridade não alterada!");

  // ── TESTE 4: Dashboard data (queries reais do DashboardPage) ──────────────
  section("TESTE 4 — Dados do Dashboard (KPIs reais)");

  const [contacts, openOpps, pendingToday, aiLogs, highTasks] = await Promise.all([
    db.contact.count({ where: { tenantId: tenant.id } }),
    db.opportunity.count({ where: { tenantId: tenant.id, status: "open" } }),
    db.task.count({
      where: {
        tenantId: tenant.id, status: "pending",
        dueAt: { lte: new Date(new Date().setHours(23, 59, 59, 999)) },
      },
    }),
    db.aiLog.findMany({
      where: { tenantId: tenant.id, createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    db.task.findMany({
      where: { tenantId: tenant.id, status: "pending", priority: "high" },
      orderBy: { dueAt: "asc" },
      take: 5,
      select: { id: true, title: true, dueAt: true, source: true,
        contact: { select: { name: true } },
        opportunity: { select: { title: true } } },
    }),
  ]);

  ok(`KPI Contatos: ${contacts}`);
  ok(`KPI Oportunidades abertas: ${openOpps}`);
  ok(`KPI Tarefas para hoje: ${pendingToday}`);
  ok(`Bloco IA hoje: ${aiLogs.length} registros`);
  ok(`Tarefas prioritárias: ${highTasks.length}`);

  contacts > 0   ? ok("Contatos não zerado ✓") : info("Sem contatos no tenant");
  openOpps > 0   ? ok("Oportunidades não zerado ✓") : info("Sem oportunidades abertas");
  highTasks.length > 0 ? ok("Tarefas prioritárias retornadas ✓") : info("Sem tarefas high priority pendentes");

  // ── TESTE 5: Vínculo contact/opportunity nas tasks ─────────────────────────
  section("TESTE 5 — Vínculos contact/opportunity nas tarefas");

  const tasksWithLinks = await db.task.findMany({
    where: { tenantId: tenant.id, status: { not: "done" } },
    select: { id: true, title: true, source: true,
      contact: { select: { id: true, name: true } },
      opportunity: { select: { id: true, title: true } } },
  });

  const withContact = tasksWithLinks.filter((t: any) => t.contact !== null);
  const withOpp     = tasksWithLinks.filter((t: any) => t.opportunity !== null);
  ok(`Tarefas com vínculo de contato: ${withContact.length}`);
  ok(`Tarefas com vínculo de oportunidade: ${withOpp.length}`);

  withContact.length > 0
    ? ok(`Exemplo: "${withContact[0].title}" → contato: ${withContact[0].contact.name}`)
    : info("Nenhuma tarefa com vínculo de contato");

  withOpp.length > 0
    ? ok(`Exemplo: "${withOpp[0].title}" → opp: ${withOpp[0].opportunity.title}`)
    : info("Nenhuma tarefa com vínculo de oportunidade");

  // ── TESTE 6: ai_log do dashboard aparece no bloco "Ações da IA" ───────────
  section("TESTE 6 — ai_logs aparecem no bloco Ações da IA");

  const logNow = await db.aiLog.create({
    data: {
      tenantId: tenant.id, userId: null,
      entityType: "contact", entityId: contact.id,
      action: "classify_lead", modelProvider: "mock", modelId: "mock-v2",
      promptTokens: 40, completionTokens: 15,
      inputSummary: "dashboard test",
      outputSummary: "score=80,class=hot,followUpDays=1",
    },
  });
  cleanup.aiLogs.push(logNow.id);

  const todayLogs = await db.aiLog.findMany({
    where: { tenantId: tenant.id, createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    orderBy: { createdAt: "desc" }, take: 10,
    select: { id: true, action: true, outputSummary: true, createdAt: true },
  });
  ok(`ai_logs de hoje retornados: ${todayLogs.length}`);
  todayLogs.some((l: any) => l.action === "classify_lead")
    ? ok("classify_lead aparece no bloco de IA ✓")
    : fail("classify_lead não encontrado nos logs do dashboard!");
  todayLogs.forEach((l: any) => info(`  ${l.action}: ${l.outputSummary}`));

  // ── Summary ───────────────────────────────────────────────────────────────
  section("RESUMO FINAL");
  const finalCounts = await db.task.groupBy({
    by: ["status"], where: { tenantId: tenant.id }, _count: { _all: true },
  });
  const fc: Record<string, number> = Object.fromEntries(
    finalCounts.map((c: any) => [c.status, c._count._all])
  );
  console.log(`  Tenant.......: ${tenant.name}`);
  console.log(`  Tasks pending: ${fc["pending"] ?? 0}`);
  console.log(`  Tasks done...: ${fc["done"] ?? 0}`);
  console.log(`  Tasks cancel.: ${fc["cancelled"] ?? 0}`);
  console.log(`  AI logs hoje.: ${todayLogs.length}`);

  // Cleanup
  info("Limpando dados de teste...");
  await db.task.deleteMany({ where: { tenantId: tenant.id } });
  await db.aiLog.deleteMany({ where: { id: { in: cleanup.aiLogs } } });
  await db.opportunity.deleteMany({ where: { id: { in: cleanup.opps } } });
  await db.contact.deleteMany({ where: { id: { in: cleanup.contacts } } });
  ok("Limpeza concluída.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());

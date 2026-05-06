import { prisma } from "@/lib/db/client";
import bcrypt from "bcryptjs";

export const DEMO_EMAIL    = "demo@crmplus.com.br";
export const DEMO_PASSWORD = "demo1234";
export const DEMO_SLUG     = "demo-crmplus";

export async function seedDemo(): Promise<{ tenantId: string; userId: string }> {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // ── Tenant ──────────────────────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where:  { slug: DEMO_SLUG },
    update: {},
    create: { name: "Empresa Demo", slug: DEMO_SLUG, plan: "starter", status: "active" },
  });

  // ── Owner user ───────────────────────────────────────────────────────────────
  const owner = await prisma.user.upsert({
    where:  { tenantId_email: { tenantId: tenant.id, email: DEMO_EMAIL } },
    update: { passwordHash: hash, isActive: true },
    create: {
      tenantId: tenant.id, name: "Carlos Demo", email: DEMO_EMAIL,
      passwordHash: hash, role: "owner", isActive: true,
    },
  });

  // ── Salesperson ──────────────────────────────────────────────────────────────
  const seller = await prisma.user.upsert({
    where:  { tenantId_email: { tenantId: tenant.id, email: "vendedor@crmplus.com.br" } },
    update: {},
    create: {
      tenantId: tenant.id, name: "Ana Vendas", email: "vendedor@crmplus.com.br",
      passwordHash: hash, role: "salesperson", isActive: true,
    },
  });

  // ── Companies ────────────────────────────────────────────────────────────────
  const [acme, beta, gamma] = await Promise.all([
    upsertCompany(tenant.id, "Acme Tecnologia Ltda",  "acme.com.br",     "(11) 3000-1000"),
    upsertCompany(tenant.id, "Beta Soluções S/A",     "betasolucoes.com", "(21) 3001-2000"),
    upsertCompany(tenant.id, "Gamma Distribuidora",   "gamma.ind.br",    "(31) 3002-3000"),
  ]);

  // ── Contacts ─────────────────────────────────────────────────────────────────
  const [c1, c2, c3, c4, c5, c6, c7, c8] = await Promise.all([
    upsertContact(tenant.id, "Ricardo Almeida",  "ricardo@acme.com.br",      "(11) 99000-1111", acme.id,  "customer"),
    upsertContact(tenant.id, "Fernanda Lima",    "fernanda@betasolucoes.com", "(21) 99001-2222", beta.id,  "customer"),
    upsertContact(tenant.id, "Marcos Oliveira",  "marcos@gamma.ind.br",      "(31) 99002-3333", gamma.id, "lead"),
    upsertContact(tenant.id, "Juliana Santos",   "juliana@gmail.com",        "(11) 98003-4444", null,     "lead"),
    upsertContact(tenant.id, "Paulo Fernandes",  "paulo@empresa.com",        "(41) 97004-5555", null,     "lead"),
    upsertContact(tenant.id, "Camila Rodrigues", "camila@consultor.com",     "(51) 96005-6666", null,     "lead"),
    upsertContact(tenant.id, "Bruno Costa",      "bruno@varejo.com.br",      "(85) 95006-7777", null,     "customer"),
    upsertContact(tenant.id, "Larissa Mendes",   "larissa@saas.com.br",      "(62) 94007-8888", null,     "lead"),
  ]);

  // ── Products ─────────────────────────────────────────────────────────────────
  const [p1, p2, p3] = await Promise.all([
    upsertProduct(tenant.id, "Licença CRM Pro",     1_490, "Software"),
    upsertProduct(tenant.id, "Implantação e Setup", 2_900, "Serviço"),
    upsertProduct(tenant.id, "Suporte Premium",       490, "Serviço"),
  ]);

  // ── Pipeline ─────────────────────────────────────────────────────────────────
  let pipeline = await prisma.pipeline.findFirst({ where: { tenantId: tenant.id, isDefault: true } });
  if (!pipeline) {
    pipeline = await prisma.pipeline.create({
      data: { tenantId: tenant.id, name: "Vendas", isDefault: true },
    });
  }

  const stageNames = [
    { name: "Prospecção",   order: 1, prob: 10 },
    { name: "Qualificação", order: 2, prob: 30 },
    { name: "Proposta",     order: 3, prob: 60 },
    { name: "Negociação",   order: 4, prob: 80 },
    { name: "Fechamento",   order: 5, prob: 95 },
  ];
  const stages: Record<string, { id: string }> = {};
  for (const s of stageNames) {
    const existing = await prisma.pipelineStage.findFirst({
      where: { pipelineId: pipeline.id, name: s.name },
    });
    stages[s.name] = existing ?? await prisma.pipelineStage.create({
      data: { tenantId: tenant.id, pipelineId: pipeline.id, name: s.name, order: s.order, probability: s.prob },
    });
  }

  // ── Opportunities ─────────────────────────────────────────────────────────────
  const now      = new Date();
  const ago  = (d: number) => new Date(now.getTime() - d * 86_400_000);
  const from = (d: number) => new Date(now.getTime() + d * 86_400_000);

  await Promise.all([
    upsertOpp(tenant.id, pipeline.id, stages["Fechamento"].id, owner.id,  c1.id, acme.id,
      "Renovação Licença CRM Pro — Acme", 5_960, "won",  ago(15), ago(15)),
    upsertOpp(tenant.id, pipeline.id, stages["Fechamento"].id, seller.id, c2.id, beta.id,
      "Implantação Beta Soluções",        8_800, "won",  ago(8),  ago(8)),
    upsertOpp(tenant.id, pipeline.id, stages["Fechamento"].id, owner.id,  c7.id, null,
      "Suporte Premium — Bruno Costa",    1_960, "won",  ago(3),  ago(3)),
    upsertOpp(tenant.id, pipeline.id, stages["Negociação"].id, seller.id, c3.id, gamma.id,
      "Contrato Gamma Distribuidora",     4_380, "lost", ago(20), ago(18)),
    upsertOpp(tenant.id, pipeline.id, stages["Proposta"].id,   seller.id, c4.id, null,
      "Proposta Juliana Santos",          2_980, "open", from(10), null),
    upsertOpp(tenant.id, pipeline.id, stages["Qualificação"].id, owner.id, c5.id, null,
      "Avaliação Paulo Fernandes",        1_490, "open", from(14), null),
    upsertOpp(tenant.id, pipeline.id, stages["Negociação"].id, seller.id, c6.id, null,
      "Negociação Camila Rodrigues",      5_470, "open", from(7),  null),
    upsertOpp(tenant.id, pipeline.id, stages["Prospecção"].id, owner.id,  c8.id, null,
      "Contato inicial Larissa Mendes",   null,  "open", from(21), null),
  ]);

  // Products + revenues on won opps
  const wonOpp = await prisma.opportunity.findFirst({
    where: { tenantId: tenant.id, title: "Renovação Licença CRM Pro — Acme" },
  });
  if (wonOpp) {
    await Promise.all([
      upsertOppProduct(tenant.id, wonOpp.id, p1.id, 4, 1_490),
      upsertOppProduct(tenant.id, wonOpp.id, p3.id, 1, 490),
    ]);
    await prisma.revenue.upsert({
      where:  { opportunityId: wonOpp.id },
      update: {},
      create: {
        tenantId: tenant.id, opportunityId: wonOpp.id,
        contactId: c1.id, companyId: acme.id,
        amount: 5_960, status: "paid", paidAt: ago(15),
        description: "Renovação anual — Acme Tecnologia",
      },
    });
  }

  const wonOpp2 = await prisma.opportunity.findFirst({
    where: { tenantId: tenant.id, title: "Implantação Beta Soluções" },
  });
  if (wonOpp2) {
    await Promise.all([
      upsertOppProduct(tenant.id, wonOpp2.id, p2.id, 1, 2_900),
      upsertOppProduct(tenant.id, wonOpp2.id, p1.id, 2, 1_490),
    ]);
    await prisma.revenue.upsert({
      where:  { opportunityId: wonOpp2.id },
      update: {},
      create: {
        tenantId: tenant.id, opportunityId: wonOpp2.id,
        contactId: c2.id, companyId: beta.id,
        amount: 8_800, status: "paid", paidAt: ago(8),
        description: "Implantação + licenças — Beta Soluções",
      },
    });
  }

  // ── Conversations + messages ──────────────────────────────────────────────────
  const conv1 = await upsertConversation(tenant.id, c4.id, owner.id,  "whatsapp",  "Interesse em CRM — Juliana Santos",    "interest");
  const conv2 = await upsertConversation(tenant.id, c5.id, seller.id, "whatsapp",  "Dúvida sobre preço — Paulo Fernandes", "price_inquiry");
  const conv3 = await upsertConversation(tenant.id, c6.id, seller.id, "instagram", "Lead Instagram — Camila Rodrigues",    "quote_request");
  const conv4 = await upsertConversation(tenant.id, c1.id, owner.id,  "manual",    "Suporte renovação — Ricardo Almeida",  null, "resolved");

  await ensureMessages(tenant.id, conv1.id, [
    { content: "Olá! Vi o anúncio de vocês. Quero saber mais sobre o CRM.",                         direction: "inbound",  senderType: "contact", minutesAgo: 90 },
    { content: "Oi Juliana! Claro, posso te explicar tudo. Qual o tamanho do seu time?",            direction: "outbound", senderType: "user",    minutesAgo: 85 },
    { content: "Somos 5 vendedores. Usamos planilha hoje mas está virando bagunça.",                 direction: "inbound",  senderType: "contact", minutesAgo: 80 },
    { content: "Entendo! O CRM PLUS resolve exatamente isso. Posso enviar uma proposta hoje?",      direction: "outbound", senderType: "user",    minutesAgo: 75 },
    { content: "Sim, por favor! Aceito uma reunião também.",                                         direction: "inbound",  senderType: "contact", minutesAgo: 20 },
  ]);
  await ensureMessages(tenant.id, conv2.id, [
    { content: "Boa tarde! Qual o preço mensal do plano?",                                           direction: "inbound",  senderType: "contact", minutesAgo: 240 },
    { content: "Oi Paulo! Temos planos a partir de R$ 490/mês. Posso fazer uma demonstração?",      direction: "outbound", senderType: "user",    minutesAgo: 230 },
    { content: "Que horas você pode?",                                                               direction: "inbound",  senderType: "contact", minutesAgo: 60 },
  ]);
  await ensureMessages(tenant.id, conv3.id, [
    { content: "Vi o post sobre automação de vendas. Trabalho como consultora, serve pra mim?",     direction: "inbound",  senderType: "contact", minutesAgo: 360 },
    { content: "Oi Camila! Sim, temos planos individuais. Me conta sua rotina de vendas?",          direction: "outbound", senderType: "user",    minutesAgo: 350 },
    { content: "Faço umas 50 cotações por mês. Perco muito tempo com follow-up manual.",            direction: "inbound",  senderType: "contact", minutesAgo: 30 },
  ]);
  await ensureMessages(tenant.id, conv4.id, [
    { content: "Preciso renovar o contrato. Como faço?",                                             direction: "inbound",  senderType: "contact", minutesAgo: 1440 },
    { content: "Oi Ricardo! Já processei. Enviei o boleto no seu e-mail.",                          direction: "outbound", senderType: "user",    minutesAgo: 1430 },
    { content: "Perfeito, obrigado!",                                                                direction: "inbound",  senderType: "contact", minutesAgo: 1420 },
  ]);

  // ── Tasks ─────────────────────────────────────────────────────────────────────
  const propOpp = await prisma.opportunity.findFirst({
    where: { tenantId: tenant.id, title: "Proposta Juliana Santos" },
  });
  await Promise.all([
    upsertTask(tenant.id, owner.id,  c4.id, propOpp?.id ?? null, "Enviar proposta para Juliana Santos",    ago(1),   "pending", "high"),
    upsertTask(tenant.id, seller.id, c5.id, null,                "Agendar demo com Paulo Fernandes",       from(1),  "pending", "medium"),
    upsertTask(tenant.id, seller.id, c6.id, null,                "Follow-up Camila Rodrigues — Instagram", from(2),  "pending", "high"),
    upsertTask(tenant.id, owner.id,  c8.id, null,                "Qualificar lead Larissa Mendes",         from(3),  "pending", "low"),
    upsertTask(tenant.id, owner.id,  c1.id, null,                "Check-in pós-renovação — Acme",          from(7),  "pending", "medium"),
    upsertTask(tenant.id, seller.id, null,  null,                "Preparar apresentação Q2",               ago(2),   "done",    "medium"),
    upsertTask(tenant.id, owner.id,  null,  null,                "Revisar metas do trimestre",             ago(5),   "done",    "low"),
  ]);

  // ── Tags ──────────────────────────────────────────────────────────────────────
  await Promise.all([
    upsertTag(tenant.id, "quente",     "#ef4444"),
    upsertTag(tenant.id, "enterprise", "#8b5cf6"),
    upsertTag(tenant.id, "follow-up",  "#f59e0b"),
    upsertTag(tenant.id, "inbound",    "#10b981"),
  ]);

  return { tenantId: tenant.id, userId: owner.id };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function upsertCompany(tenantId: string, name: string, domain: string, phone: string) {
  return (await prisma.company.findFirst({ where: { tenantId, name } }))
    ?? await prisma.company.create({ data: { tenantId, name, domain, phone } });
}

async function upsertContact(
  tenantId: string, name: string, email: string, phone: string,
  companyId: string | null, status: "lead" | "customer" | "inactive",
) {
  return (await prisma.contact.findFirst({ where: { tenantId, email } }))
    ?? await prisma.contact.create({ data: { tenantId, name, email, phone, companyId, status } });
}

async function upsertProduct(tenantId: string, name: string, price: number, category: string) {
  return (await prisma.product.findFirst({ where: { tenantId, name } }))
    ?? await prisma.product.create({ data: { tenantId, name, price, category, status: "active" } });
}

async function upsertOpp(
  tenantId: string, pipelineId: string, stageId: string,
  userId: string, contactId: string, companyId: string | null,
  title: string, value: number | null, status: "open" | "won" | "lost",
  expectedCloseAt: Date | null, closedAt: Date | null,
) {
  return (await prisma.opportunity.findFirst({ where: { tenantId, title } }))
    ?? await prisma.opportunity.create({
      data: {
        tenantId, pipelineId, stageId, assignedUserId: userId,
        contactId, companyId, title,
        value: value ?? undefined,
        status, expectedCloseAt, closedAt,
      },
    });
}

async function upsertOppProduct(
  tenantId: string, opportunityId: string, productId: string,
  quantity: number, unitPrice: number,
) {
  return (await prisma.opportunityProduct.findFirst({ where: { opportunityId, productId } }))
    ?? await prisma.opportunityProduct.create({
      data: { tenantId, opportunityId, productId, quantity, unitPrice, totalPrice: quantity * unitPrice },
    });
}

async function upsertConversation(
  tenantId: string, contactId: string, userId: string,
  channel: "whatsapp" | "instagram" | "email" | "manual",
  subject: string, detectedIntent: string | null,
  status: "open" | "pending" | "resolved" = "open",
) {
  return (await prisma.conversation.findFirst({ where: { tenantId, subject } }))
    ?? await prisma.conversation.create({
      data: { tenantId, contactId, assignedUserId: userId, channel, status, subject, detectedIntent, lastMessageAt: new Date() },
    });
}

async function ensureMessages(
  tenantId: string, conversationId: string,
  msgs: { content: string; direction: "inbound" | "outbound"; senderType: "user" | "contact" | "bot"; minutesAgo: number }[],
) {
  const count = await prisma.message.count({ where: { conversationId } });
  if (count > 0) return;
  const base = Date.now();
  for (const m of msgs) {
    await prisma.message.create({
      data: { tenantId, conversationId, content: m.content, direction: m.direction, senderType: m.senderType, sentAt: new Date(base - m.minutesAgo * 60_000) },
    });
  }
  await prisma.conversation.update({
    where: { id: conversationId },
    data:  { lastMessageAt: new Date(base - msgs[msgs.length - 1].minutesAgo * 60_000) },
  });
}

async function upsertTask(
  tenantId: string, userId: string, contactId: string | null,
  opportunityId: string | null, title: string,
  dueAt: Date, status: "pending" | "done" | "cancelled", priority: "low" | "medium" | "high",
) {
  return (await prisma.task.findFirst({ where: { tenantId, title } }))
    ?? await prisma.task.create({
      data: { tenantId, assignedUserId: userId, contactId, opportunityId, title, dueAt, status, priority },
    });
}

async function upsertTag(tenantId: string, name: string, color: string) {
  return (await prisma.tag.findFirst({ where: { tenantId, name } }))
    ?? await prisma.tag.create({ data: { tenantId, name, color } });
}

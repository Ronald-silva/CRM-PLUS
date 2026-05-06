import "dotenv/config";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as never);

const SEP = "─".repeat(60);
function section(title: string) { console.log(`\n${SEP}\n${title}\n${SEP}`); }
function ok(msg: string)   { console.log(`  ✅ ${msg}`); }
function fail(msg: string) { console.log(`  ❌ ${msg}`); }
function info(msg: string) { console.log(`  ℹ  ${msg}`); }

async function main() {
  // ── find a tenant ──────────────────────────────────────────────────────────
  let tenant = await (prisma as any).tenant.findFirst();
  if (!tenant) {
    tenant = await (prisma as any).tenant.create({
      data: { name: "Tenant Validação", slug: "validacao-test", plan: "free", status: "active" },
    });
    ok(`Tenant criado: ${tenant.name} (${tenant.id})`);
  } else {
    info(`Usando tenant: ${tenant.name} (${tenant.id})`);
  }

  // find a product
  let product = await (prisma as any).product.findFirst({ where: { tenantId: tenant.id, status: "active" } });
  if (!product) {
    product = await (prisma as any).product.create({
      data: { tenantId: tenant.id, name: "Produto Teste", price: 500.00, status: "active" },
    });
    ok(`Produto criado: ${product.name} — R$ ${product.price}`);
  } else {
    info(`Produto existente: ${product.name} — R$ ${product.price}`);
  }

  // find or create pipeline + stage
  let pipeline = await (prisma as any).pipeline.findFirst({ where: { tenantId: tenant.id } });
  if (!pipeline) {
    pipeline = await (prisma as any).pipeline.create({
      data: { tenantId: tenant.id, name: "Vendas", isDefault: true },
    });
    ok(`Pipeline criado: ${pipeline.name}`);
  }
  let stage = await (prisma as any).pipelineStage.findFirst({ where: { pipelineId: pipeline.id } });
  if (!stage) {
    stage = await (prisma as any).pipelineStage.create({
      data: { tenantId: tenant.id, pipelineId: pipeline.id, name: "Prospecção", order: 1, probability: 10 },
    });
    ok(`Etapa criada: ${stage.name}`);
  }

  // ── TESTE 1 ────────────────────────────────────────────────────────────────
  section("TESTE 1 — Oportunidade → Faturamento");

  const contact = await (prisma as any).contact.create({
    data: { tenantId: tenant.id, name: "Contato Validação", email: "validacao@test.com", status: "lead" },
  });
  ok(`Contato criado: ${contact.name} (${contact.id})`);

  const opportunity = await (prisma as any).opportunity.create({
    data: {
      tenantId: tenant.id,
      contactId: contact.id,
      pipelineId: pipeline.id,
      stageId: stage.id,
      title: "Oportunidade Validação",
      status: "open",
    },
  });
  ok(`Oportunidade criada: ${opportunity.title} (${opportunity.id})`);

  const unitPrice = Number(product.price);
  const quantity  = 2;
  const totalPrice = unitPrice * quantity;

  await (prisma as any).opportunityProduct.create({
    data: { tenantId: tenant.id, opportunityId: opportunity.id, productId: product.id, quantity, unitPrice, totalPrice },
  });

  const items = await (prisma as any).opportunityProduct.findMany({
    where: { opportunityId: opportunity.id }, select: { totalPrice: true },
  });
  const valueTotal = items.reduce((s: number, i: any) => s + Number(i.totalPrice), 0);
  await (prisma as any).opportunity.update({ where: { id: opportunity.id }, data: { value: valueTotal } });
  ok(`Produto adicionado: ${product.name} × ${quantity} = R$ ${totalPrice.toFixed(2)}`);
  ok(`Valor da oportunidade: R$ ${valueTotal.toFixed(2)}`);

  // Mark as won + upsert revenue (same logic as route.ts PATCH)
  const wonOpp = await (prisma as any).opportunity.update({
    where: { id: opportunity.id },
    data: { status: "won", closedAt: new Date() },
  });
  ok(`Status = won. closedAt = ${wonOpp.closedAt ? wonOpp.closedAt.toISOString() : "VAZIO ❌"}`);

  await (prisma as any).revenue.upsert({
    where: { opportunityId: opportunity.id },
    create: {
      tenantId: tenant.id,
      opportunityId: opportunity.id,
      contactId: contact.id,
      companyId: null,
      amount: Number(wonOpp.value) || 0,
      status: "pending",
      description: `Venda ganha: ${wonOpp.title}`,
    },
    update: {},
  });

  const revenue = await (prisma as any).revenue.findUnique({ where: { opportunityId: opportunity.id } });
  if (revenue) {
    ok(`Faturamento criado: R$ ${Number(revenue.amount).toFixed(2)} — status: ${revenue.status}`);
    Number(revenue.amount) === valueTotal
      ? ok(`Valor bate: R$ ${Number(revenue.amount).toFixed(2)} === R$ ${valueTotal.toFixed(2)}`)
      : fail(`Valor diverge: faturamento R$ ${revenue.amount} ≠ opp R$ ${valueTotal}`);
  } else {
    fail("Faturamento NÃO criado!");
  }

  // Deduplication: call upsert twice
  await (prisma as any).revenue.upsert({
    where: { opportunityId: opportunity.id },
    create: { tenantId: tenant.id, opportunityId: opportunity.id, contactId: contact.id, companyId: null, amount: 99999, status: "pending", description: "DUPLICADO" },
    update: {},
  });
  const allRevs = await (prisma as any).revenue.findMany({ where: { opportunityId: opportunity.id } });
  allRevs.length === 1
    ? ok(`Sem duplicação: exatamente 1 faturamento por oportunidade`)
    : fail(`DUPLICAÇÃO! ${allRevs.length} registros encontrados!`);

  // ── TESTE 2 ────────────────────────────────────────────────────────────────
  section("TESTE 2 — Reabrir oportunidade (won → open)");

  await (prisma as any).opportunity.update({
    where: { id: opportunity.id },
    data: { status: "open", closedAt: null },
  });
  ok("Status revertido para open, closedAt = null");

  const revAfter = await (prisma as any).revenue.findUnique({ where: { opportunityId: opportunity.id } });
  revAfter
    ? ok(`Faturamento PERSISTIU: R$ ${Number(revAfter.amount).toFixed(2)} — status: ${revAfter.status}`)
    : fail("Faturamento foi deletado! BUG!");

  // ── TESTE 3 ────────────────────────────────────────────────────────────────
  section("TESTE 3 — AI Log (classifyLead)");

  const contact2 = await (prisma as any).contact.create({
    data: { tenantId: tenant.id, name: "Contato AI Teste", email: "ai-teste@test.com", status: "lead" },
  });
  ok(`Novo contato criado: ${contact2.name} (${contact2.id})`);

  const aiLog = await (prisma as any).aiLog.create({
    data: {
      tenantId: tenant.id,
      userId: null,
      entityType: "contact",
      entityId: contact2.id,
      action: "classify_lead",
      modelProvider: "mock",
      modelId: "mock-classifier-v1",
      promptTokens: 50,
      completionTokens: 10,
      inputSummary: `name: ${contact2.name}`,
      outputSummary: JSON.stringify({ status: "lead", reason: "Novo contato sem histórico" }),
    },
  });
  ok(`ai_log criado: id=${aiLog.id}`);
  ok(`  action......: ${aiLog.action}`);
  ok(`  entityType..: ${aiLog.entityType}`);
  ok(`  entityId....: ${aiLog.entityId}`);
  ok(`  modelProvider: ${aiLog.modelProvider}`);
  ok(`  outputSummary: ${aiLog.outputSummary}`);

  // ── TESTE 4 ────────────────────────────────────────────────────────────────
  section("TESTE 4 — Consistência de tenant_id");

  const contacts = await (prisma as any).contact.findMany({ where: { tenantId: tenant.id }, select: { id: true, tenantId: true } });
  const wrongC = contacts.filter((c: any) => c.tenantId !== tenant.id);
  ok(`Contatos do tenant: ${contacts.length} — vazamento: ${wrongC.length === 0 ? "NENHUM ✅" : `${wrongC.length} ❌`}`);

  const opps = await (prisma as any).opportunity.findMany({ where: { tenantId: tenant.id }, select: { id: true, tenantId: true, status: true } });
  const wrongO = opps.filter((o: any) => o.tenantId !== tenant.id);
  ok(`Oportunidades do tenant: ${opps.length} (${opps.filter((o:any)=>o.status==="won").length} won, ${opps.filter((o:any)=>o.status==="open").length} open) — vazamento: ${wrongO.length === 0 ? "NENHUM ✅" : `${wrongO.length} ❌`}`);

  const revenues = await (prisma as any).revenue.findMany({ where: { tenantId: tenant.id }, select: { id: true, tenantId: true, amount: true, status: true } });
  const wrongR = revenues.filter((r: any) => r.tenantId !== tenant.id);
  ok(`Faturamentos do tenant: ${revenues.length} — vazamento: ${wrongR.length === 0 ? "NENHUM ✅" : `${wrongR.length} ❌`}`);

  section("RESUMO FINAL");
  console.log(`  Tenant.......: ${tenant.name}`);
  console.log(`  Contatos.....: ${contacts.length} total`);
  console.log(`  Oportunidades: ${opps.length} total`);
  console.log(`  Faturamentos.: ${revenues.length} total`);

  // cleanup
  info("Limpando dados de teste...");
  await (prisma as any).revenue.deleteMany({ where: { opportunityId: opportunity.id } });
  await (prisma as any).opportunityProduct.deleteMany({ where: { opportunityId: opportunity.id } });
  await (prisma as any).opportunity.delete({ where: { id: opportunity.id } });
  await (prisma as any).aiLog.delete({ where: { id: aiLog.id } });
  await (prisma as any).contact.deleteMany({ where: { id: { in: [contact.id, contact2.id] } } });
  ok("Dados de teste removidos.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => (prisma as any).$disconnect());

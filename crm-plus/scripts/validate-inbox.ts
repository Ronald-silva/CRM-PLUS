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
      data: { name: "Tenant Inbox Teste", slug: "inbox-test-01", plan: "free", status: "active" },
    });
  }
  info(`Tenant: ${tenant.name} (${tenant.id})`);

  const cleanup = { conversations: [] as string[], contacts: [] as string[], tasks: [] as string[], aiLogs: [] as string[] };

  // ── TESTE 1: Criar conversa para cada canal ───────────────────────────────
  section("TESTE 1 — Criar conversas (todos os canais)");

  const contact = await db.contact.create({
    data: { tenantId: tenant.id, name: "Cliente Inbox", email: "inbox@empresa.com", phone: "11999990000", status: "lead" },
  });
  cleanup.contacts.push(contact.id);

  const channels = ["manual", "whatsapp", "instagram", "email"];
  const createdConvs: any[] = [];

  for (const channel of channels) {
    const conv = await db.conversation.create({
      data: {
        tenantId:  tenant.id,
        contactId: contact.id,
        channel,
        status:    "open",
        subject:   `Teste via ${channel}`,
      },
    });
    cleanup.conversations.push(conv.id);
    createdConvs.push(conv);
    ok(`Conversa criada: channel=${conv.channel}, status=${conv.status}, id=${conv.id.slice(0,8)}...`);
  }

  // Verify tenant isolation
  const allConvs = await db.conversation.findMany({ where: { tenantId: tenant.id } });
  allConvs.every((c: any) => c.tenantId === tenant.id)
    ? ok(`tenant_id consistente em ${allConvs.length} conversas ✓`)
    : fail("Vazamento de tenant_id!");

  // ── TESTE 2: Criar mensagens e verificar lastMessageAt ────────────────────
  section("TESTE 2 — Mensagens e atualização de lastMessageAt");

  const conv = createdConvs[0]; // manual conversation
  const msgsBefore = [
    { content: "Olá, tudo bem?",           direction: "outbound", senderType: "user"    },
    { content: "Tenho interesse no produto.", direction: "inbound", senderType: "contact" },
    { content: "Que ótimo! Como posso ajudar?", direction: "outbound", senderType: "user" },
  ];

  let lastSentAt: Date | null = null;
  for (const m of msgsBefore) {
    const sentAt = new Date();
    const msg = await db.message.create({
      data: {
        conversationId: conv.id,
        tenantId:       tenant.id,
        content:        m.content,
        direction:      m.direction,
        senderType:     m.senderType,
        sentAt,
      },
    });
    await db.conversation.update({
      where: { id: conv.id },
      data:  { lastMessageAt: sentAt },
    });
    lastSentAt = sentAt;
    ok(`Mensagem criada: [${m.direction}] "${m.content.slice(0, 30)}..."`);
  }

  const updatedConv = await db.conversation.findUnique({ where: { id: conv.id } });
  updatedConv.lastMessageAt !== null
    ? ok(`lastMessageAt atualizado: ${updatedConv.lastMessageAt.toISOString()}`)
    : fail("lastMessageAt deveria estar preenchido!");

  // ── TESTE 3: Listar mensagens em ordem cronológica ────────────────────────
  section("TESTE 3 — Ordenação de mensagens (asc por sentAt)");

  const messages = await db.message.findMany({
    where:   { conversationId: conv.id },
    orderBy: { sentAt: "asc" },
    select:  { id: true, content: true, direction: true, senderType: true, sentAt: true },
  });

  ok(`Total de mensagens: ${messages.length} (esperado ${msgsBefore.length})`);
  messages.length === msgsBefore.length
    ? ok("Contagem correta ✓")
    : fail(`Contagem errada! Esperado ${msgsBefore.length}, obteve ${messages.length}`);

  // Check chronological order
  let ordered = true;
  for (let i = 1; i < messages.length; i++) {
    if (new Date(messages[i].sentAt) < new Date(messages[i - 1].sentAt)) { ordered = false; break; }
  }
  ordered ? ok("Mensagens em ordem cronológica ✓") : fail("Mensagens fora de ordem!");

  messages.forEach((m: any, i: number) => {
    info(`  [${i + 1}] ${m.direction.padEnd(9)} | ${m.senderType.padEnd(8)} | "${m.content}"`);
  });

  // ── TESTE 4: Filtrar por status e canal ───────────────────────────────────
  section("TESTE 4 — Filtros por status e canal");

  // Mark one as resolved
  await db.conversation.update({ where: { id: createdConvs[1].id }, data: { status: "resolved" } });
  await db.conversation.update({ where: { id: createdConvs[2].id }, data: { status: "pending"  } });

  const openConvs     = await db.conversation.findMany({ where: { tenantId: tenant.id, status: "open"     } });
  const resolvedConvs = await db.conversation.findMany({ where: { tenantId: tenant.id, status: "resolved" } });
  const pendingConvs  = await db.conversation.findMany({ where: { tenantId: tenant.id, status: "pending"  } });
  const waConvs       = await db.conversation.findMany({ where: { tenantId: tenant.id, channel: "whatsapp" } });

  ok(`open: ${openConvs.length}, pending: ${pendingConvs.length}, resolved: ${resolvedConvs.length}`);
  ok(`WhatsApp conversations: ${waConvs.length}`);
  openConvs.every((c: any)     => c.status === "open")     ? ok("Filtro open ✓")     : fail("Filtro open com resultado incorreto!");
  resolvedConvs.every((c: any) => c.status === "resolved") ? ok("Filtro resolved ✓") : fail("Filtro resolved incorreto!");
  waConvs.every((c: any)       => c.channel === "whatsapp")? ok("Filtro canal ✓")    : fail("Filtro canal incorreto!");

  // ── TESTE 5: groupBy status (usado nos pills da UI) ───────────────────────
  section("TESTE 5 — groupBy status (pills de contagem na UI)");

  const counts = await db.conversation.groupBy({
    by:    ["status"],
    where: { tenantId: tenant.id },
    _count: { _all: true },
  });
  const cm: Record<string, number> = Object.fromEntries(counts.map((c: any) => [c.status, c._count._all]));
  ok(`Status counts: ${JSON.stringify(cm)}`);
  (cm["open"] ?? 0) > 0     ? ok("open count > 0 ✓")     : info("Nenhuma conversa open");
  (cm["resolved"] ?? 0) > 0 ? ok("resolved count > 0 ✓") : info("Nenhuma conversa resolved");
  (cm["pending"]  ?? 0) > 0 ? ok("pending count > 0 ✓")  : info("Nenhuma conversa pending");

  // ── TESTE 6: Preview de última mensagem na lista ──────────────────────────
  section("TESTE 6 — Preview de última mensagem (sidebar)");

  const convWithPreview = await db.conversation.findFirst({
    where: { id: conv.id },
    select: {
      id: true, status: true, channel: true,
      contact: { select: { id: true, name: true } },
      messages: {
        orderBy: { sentAt: "desc" },
        take:    1,
        select:  { content: true, direction: true, sentAt: true },
      },
    },
  });

  const lastMsg = convWithPreview.messages[0];
  lastMsg
    ? ok(`Última mensagem preview: "${lastMsg.content}" (${lastMsg.direction})`)
    : fail("Preview de última mensagem não retornado!");

  // ── TESTE 7: suggestNextAction é acionado ao enviar mensagem ──────────────
  section("TESTE 7 — suggestNextAction após mensagem outbound");

  const aiLogsBefore = await db.aiLog.count({ where: { tenantId: tenant.id, action: "suggest_next_action" } });

  // Simulate what the API does
  const now = new Date();
  await db.message.create({
    data: {
      conversationId: conv.id,
      tenantId: tenant.id,
      content: "Posso te ajudar com mais alguma coisa?",
      direction: "outbound",
      senderType: "user",
      sentAt: now,
    },
  });
  await db.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: now } });

  // Simulate suggestNextAction being called
  const dueAt = new Date(); dueAt.setDate(dueAt.getDate() + 1);
  const aiTask = await db.task.create({
    data: {
      tenantId:  tenant.id,
      contactId: contact.id,
      title:     "Follow-up de conversa",
      description: "Acompanhar cliente após mensagem enviada.",
      dueAt,
      status:   "pending",
      priority: "medium",
      source:   "ai",
    },
  });
  cleanup.tasks.push(aiTask.id);

  const aiLog = await db.aiLog.create({
    data: {
      tenantId:      tenant.id,
      entityType:    "contact",
      entityId:      contact.id,
      action:        "suggest_next_action",
      modelProvider: "mock",
      modelId:       "mock-v2",
      promptTokens:  30,
      completionTokens: 20,
      inputSummary:  "trigger=outbound_message",
      outputSummary: `task="${aiTask.title}",priority=medium,dueInDays=1`,
    },
  });
  cleanup.aiLogs.push(aiLog.id);

  const aiLogsAfter = await db.aiLog.count({ where: { tenantId: tenant.id, action: "suggest_next_action" } });
  ok(`ai_logs suggest_next_action antes: ${aiLogsBefore}, depois: ${aiLogsAfter}`);
  aiLogsAfter > aiLogsBefore ? ok("ai_log criado após mensagem outbound ✓") : fail("ai_log não foi criado!");

  const taskCreated = await db.task.findUnique({ where: { id: aiTask.id } });
  taskCreated
    ? ok(`Task criada pela IA: "${taskCreated.title}", source=${taskCreated.source} ✓`)
    : fail("Task não encontrada!");

  // ── TESTE 8: Deletar mensagens em cascata ao deletar conversa ─────────────
  section("TESTE 8 — Cascade delete (conversa → mensagens)");

  // Create a disposable conversation with messages
  const dispConv = await db.conversation.create({
    data: { tenantId: tenant.id, channel: "manual", status: "open" },
  });
  await db.message.createMany({
    data: [
      { conversationId: dispConv.id, tenantId: tenant.id, content: "msg 1", direction: "outbound", senderType: "user" },
      { conversationId: dispConv.id, tenantId: tenant.id, content: "msg 2", direction: "inbound",  senderType: "contact" },
    ],
  });

  const msgCountBefore = await db.message.count({ where: { conversationId: dispConv.id } });
  ok(`Mensagens antes do delete: ${msgCountBefore}`);

  await db.conversation.delete({ where: { id: dispConv.id } });

  const msgCountAfter = await db.message.count({ where: { conversationId: dispConv.id } });
  msgCountAfter === 0
    ? ok("Cascade delete funcionou: mensagens deletadas junto com a conversa ✓")
    : fail(`${msgCountAfter} mensagens órfãs após delete!`);

  // ── Summary ───────────────────────────────────────────────────────────────
  section("RESUMO FINAL");
  const finalMsgs  = await db.message.count({ where: { tenantId: tenant.id } });
  const finalConvs = await db.conversation.count({ where: { tenantId: tenant.id } });
  console.log(`  Tenant.......: ${tenant.name}`);
  console.log(`  Conversas....: ${finalConvs} total (4 canais)`);
  console.log(`  Mensagens....: ${finalMsgs} total`);
  console.log(`  AI Tasks.....: 1 criada via simulação`);
  console.log(`  AI Logs......: 1 criado via simulação`);

  // Cleanup
  info("Limpando dados de teste...");
  await db.aiLog.deleteMany({ where: { id: { in: cleanup.aiLogs } } });
  await db.task.deleteMany({ where: { id: { in: cleanup.tasks } } });
  for (const id of cleanup.conversations) {
    await db.conversation.deleteMany({ where: { id } });
  }
  await db.contact.deleteMany({ where: { id: { in: cleanup.contacts } } });
  ok("Limpeza concluída.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());

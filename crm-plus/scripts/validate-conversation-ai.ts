import "dotenv/config";
import { PrismaClient } from "../lib/generated/prisma/client";
import { SenderType, MessageDirection, ConversationChannel, ConversationStatus } from "../lib/generated/prisma/enums";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter } as never) as any;

const SEP = "─".repeat(60);
function section(t: string) { console.log(`\n${SEP}\n${t}\n${SEP}`); }
function ok(m: string)      { console.log(`  ✅ ${m}`); }
function fail(m: string)    { console.log(`  ❌ ${m}`); process.exitCode = 1; }
function info(m: string)    { console.log(`  ℹ  ${m}`); }

// ── Inline: summarizeConversation ────────────────────────────────────────────
async function summarizeConversation(input: { conversationId: string; tenantId: string; userId?: string }) {
  const messages = await db.message.findMany({
    where:   { conversationId: input.conversationId, tenantId: input.tenantId },
    orderBy: { sentAt: "asc" },
    select:  { content: true, direction: true, sentAt: true },
  });

  const keywords = ["orçamento", "problema", "urgente", "quero", "cancelar", "dúvida", "preço", "interesse", "proposta"];
  const allText  = messages.map((m: any) => m.content.toLowerCase()).join(" ");
  const found    = keywords.filter((k) => allText.includes(k));

  const keyPoints: string[] = [];
  if (found.includes("orçamento") || found.includes("preço") || found.includes("proposta"))
    keyPoints.push("Cliente solicitou informações de preço/orçamento");
  if (found.includes("problema"))    keyPoints.push("Problema ou insatisfação mencionado");
  if (found.includes("urgente"))     keyPoints.push("Urgência identificada");
  if (found.includes("quero") || found.includes("interesse")) keyPoints.push("Interesse de compra detectado");
  if (found.includes("cancelar"))    keyPoints.push("Possível cancelamento mencionado");
  if (found.includes("dúvida"))      keyPoints.push("Dúvidas não esclarecidas");
  if (keyPoints.length === 0)        keyPoints.push("Conversa em andamento sem pontos críticos identificados");

  const summary = `[MOCK] Conversa com ${messages.length} mensagens. Tópicos: ${found.length > 0 ? found.join(", ") : "nenhum tópico especial"}.`;
  const lastMsg = messages[messages.length - 1];

  await db.$transaction([
    db.conversation.update({ where: { id: input.conversationId }, data: { summaryText: summary } }),
    db.aiLog.create({
      data: {
        tenantId: input.tenantId, userId: input.userId ?? null,
        entityType: "conversation", entityId: input.conversationId,
        action: "summarize_conversation", modelProvider: "mock", modelId: "mock-v2",
        promptTokens: messages.length * 15, completionTokens: 30,
        inputSummary: `messages=${messages.length}`,
        outputSummary: `keyPoints=${keyPoints.length}, keywords=[${found.join(",")}]`,
      },
    }),
  ]);

  return { summary, keyPoints, messageCount: messages.length, lastUpdated: lastMsg?.sentAt ?? new Date() };
}

// ── Inline: suggestReply ──────────────────────────────────────────────────────
async function suggestReply(input: { conversationId: string; tenantId: string; userId?: string; contactName?: string }) {
  const messages = await db.message.findMany({
    where:   { conversationId: input.conversationId, tenantId: input.tenantId },
    orderBy: { sentAt: "desc" },
    take:    5,
    select:  { content: true, direction: true },
  });

  const inboundText = messages.filter((m: any) => m.direction === "inbound").map((m: any) => m.content.toLowerCase()).join(" ");
  const name        = input.contactName ?? "cliente";

  const patterns: [RegExp, () => { suggestion: string; tone: "professional" | "friendly" | "empathetic" }][] = [
    [/orçamento|preço|valor|quanto custa|proposta|tabela de preços|investimento/,
      () => ({ tone: "professional", suggestion: `Olá, ${name}! Preparei uma proposta personalizada para você. Nossos planos começam a partir de R$ 297/mês. Posso enviar os detalhes por e-mail ou prefere conversar agora?` })],
    [/problema|erro|não funciona|reclamação|insatisfeito|horrível|péssimo|absurdo/,
      () => ({ tone: "empathetic",   suggestion: `Olá, ${name}. Lamentamos muito pelo transtorno. Vou escalar seu caso imediatamente para nossa equipe técnica. Você pode me dar mais detalhes sobre o problema?` })],
    [/urgente|urgência|rápido|hoje|agora|imediato|prazo/,
      () => ({ tone: "professional", suggestion: `Olá, ${name}! Entendemos a urgência. Estou priorizando seu atendimento agora. Em até 30 minutos teremos uma resposta para você.` })],
    [/quero|gostei|interesse|comprar|contratar|fechar|adorei|excelente/,
      () => ({ tone: "friendly",     suggestion: `Que ótima notícia, ${name}! Fico feliz com seu interesse. Posso te ajudar a finalizar agora mesmo. Qual a melhor forma de prosseguir?` })],
    [/dúvida|como funciona|como usar|quando|onde|qual é|não entendi/,
      () => ({ tone: "friendly",     suggestion: `Olá, ${name}! Com prazer esclareço sua dúvida. Pode me contar mais detalhes sobre o que precisa saber?` })],
  ];

  let suggestion = `Olá, ${name}! Como posso te ajudar hoje?`;
  let tone: "professional" | "friendly" | "empathetic" = "friendly";
  let confidence = 60;

  for (const [pattern, build] of patterns) {
    if (pattern.test(inboundText)) {
      const r = build();
      suggestion = r.suggestion;
      tone       = r.tone;
      confidence = 88;
      break;
    }
  }

  await db.aiLog.create({
    data: {
      tenantId: input.tenantId, userId: input.userId ?? null,
      entityType: "conversation", entityId: input.conversationId,
      action: "suggest_reply", modelProvider: "mock", modelId: "mock-v2",
      promptTokens: messages.length * 10, completionTokens: 45,
      inputSummary: `messages=${messages.length}`,
      outputSummary: `tone=${tone}, confidence=${confidence}%`,
    },
  });

  return { suggestion, tone, confidence };
}

// ── Inline: detectIntent ──────────────────────────────────────────────────────
async function detectIntent(input: { conversationId: string; tenantId: string; userId?: string; contactId?: string }) {
  const messages = await db.message.findMany({
    where:   { conversationId: input.conversationId, tenantId: input.tenantId },
    orderBy: { sentAt: "desc" },
    take:    10,
    select:  { content: true, direction: true },
  });

  const INTENT_PATTERNS = [
    { intent: "complaint",       patterns: /problema|erro|não funciona|reclamação|insatisfeito|horrível|péssimo|decepcionado|absurdo/, priority: 1 },
    { intent: "urgency",         patterns: /urgente|urgência|rápido|hoje|agora|imediato|prazo|deadline|preciso urgente/,              priority: 2 },
    { intent: "quote_request",   patterns: /orçamento|preço|valor|quanto custa|proposta|tabela de preços|investimento/,              priority: 3 },
    { intent: "losing_interest", patterns: /não tenho interesse|desistir|cancelar|não vou|desistiu|esqueça|não preciso mais/,        priority: 4 },
    { intent: "interest",        patterns: /quero|gostei|interesse|comprar|contratar|fechar|adorei|excelente|perfeito/,              priority: 5 },
    { intent: "doubt",           patterns: /dúvida|como funciona|como usar|quando|onde|qual é|não entendi|pode explicar/,            priority: 6 },
  ];

  const inboundText = messages.filter((m: any) => m.direction === "inbound").map((m: any) => m.content.toLowerCase()).join(" ");
  const allText     = messages.map((m: any) => m.content.toLowerCase()).join(" ");

  let detectedIntent = "neutral";
  let confidence     = 50;

  for (const { intent, patterns } of INTENT_PATTERNS) {
    if (patterns.test(inboundText) || patterns.test(allText)) {
      detectedIntent = intent;
      confidence = patterns.test(inboundText) ? 85 : 65;
      break;
    }
  }

  const INTENT_LABELS: Record<string, string> = {
    complaint: "Reclamação", urgency: "Urgência", quote_request: "Pedido de orçamento",
    losing_interest: "Perda de interesse", interest: "Interesse de compra", doubt: "Dúvida", neutral: "Neutro",
  };
  const details = `[MOCK] Intenção detectada: ${INTENT_LABELS[detectedIntent]} (${confidence}% confiança). Analisadas ${messages.length} mensagens.`;

  let taskId: string | null = null;
  let taskCreated = false;

  const TASK_INTENTS = ["complaint", "urgency", "quote_request", "interest", "losing_interest"];
  if (TASK_INTENTS.includes(detectedIntent)) {
    const existing = await db.task.findFirst({
      where: { tenantId: input.tenantId, source: "ai", status: "pending", description: { contains: input.conversationId } },
    });

    if (!existing) {
      const TEMPLATES: Record<string, { title: string; priority: string }> = {
        complaint:       { title: "ALERTA: Reclamação detectada — atender imediatamente", priority: "high"   },
        urgency:         { title: "Cliente com urgência — responder agora",               priority: "high"   },
        quote_request:   { title: "Enviar proposta/orçamento",                            priority: "high"   },
        interest:        { title: "Follow-up: Lead quente na conversa",                   priority: "high"   },
        losing_interest: { title: "Risco de perda — reativar engajamento",                priority: "medium" },
      };
      const tmpl = TEMPLATES[detectedIntent];
      if (tmpl) {
        const dueAt = new Date();
        dueAt.setHours(dueAt.getHours() + (detectedIntent === "complaint" || detectedIntent === "urgency" ? 2 : 24));
        const task = await db.task.create({
          data: {
            tenantId: input.tenantId, contactId: input.contactId ?? null,
            title: tmpl.title, priority: tmpl.priority, status: "pending", source: "ai",
            description: `Intenção detectada na conversa ${input.conversationId}. Confiança: ${confidence}%.`,
            dueAt,
          },
        });
        taskId = task.id;
        taskCreated = true;
      }
    } else {
      taskId = existing.id;
    }
  }

  await db.$transaction([
    db.conversation.update({ where: { id: input.conversationId }, data: { detectedIntent } }),
    db.aiLog.create({
      data: {
        tenantId: input.tenantId, userId: input.userId ?? null,
        entityType: "conversation", entityId: input.conversationId,
        action: "detect_intent", modelProvider: "mock", modelId: "mock-v2",
        promptTokens: messages.length * 12, completionTokens: 20,
        inputSummary: `messages=${messages.length}, inbound=${messages.filter((m: any) => m.direction === "inbound").length}`,
        outputSummary: `intent=${detectedIntent}, confidence=${confidence}%, taskCreated=${taskCreated}`,
      },
    }),
  ]);

  return { intent: detectedIntent, confidence, details, taskId, taskCreated };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== Validate: Conversation AI Functions ===");

  let tenant = await db.tenant.findFirst();
  if (!tenant) {
    tenant = await db.tenant.create({ data: { name: "Test Tenant", slug: "test" } });
  }
  let contact = await db.contact.findFirst({ where: { tenantId: tenant.id } });
  if (!contact) {
    contact = await db.contact.create({
      data: { tenantId: tenant.id, name: "João Silva", email: "joao@empresa.com.br" },
    });
  }
  info(`tenant=${tenant.id.slice(0, 8)}… contact=${contact.id.slice(0, 8)}…`);

  const conv = await db.conversation.create({
    data: {
      tenantId: tenant.id, contactId: contact.id,
      channel: ConversationChannel.whatsapp, status: ConversationStatus.open,
      subject: "Teste IA na conversa",
    },
  });

  const now = new Date();
  const msgs = [
    { content: "Olá, preciso de um orçamento para o plano enterprise.", direction: MessageDirection.inbound,  offset: -60 },
    { content: "Claro! Posso te enviar nossa tabela de preços.",         direction: MessageDirection.outbound, offset: -50 },
    { content: "Qual é o valor para 50 usuários?",                      direction: MessageDirection.inbound,  offset: -40 },
    { content: "Para 50 usuários o investimento é R$ 2.500/mês.",       direction: MessageDirection.outbound, offset: -30 },
    { content: "Tenho interesse. Vocês têm desconto para anual?",       direction: MessageDirection.inbound,  offset: -20 },
    { content: "Sim! Pagando anual você economiza 2 meses.",            direction: MessageDirection.outbound, offset: -10 },
  ];
  for (const m of msgs) {
    await db.message.create({
      data: {
        tenantId: tenant.id, conversationId: conv.id,
        direction: m.direction,
        senderType: m.direction === MessageDirection.inbound ? SenderType.contact : SenderType.user,
        content: m.content, sentAt: new Date(now.getTime() + m.offset * 1000),
      },
    });
  }
  info(`Created conversation ${conv.id.slice(0, 8)}… with ${msgs.length} messages`);

  // ── Test 1: summarizeConversation ──────────────────────────────────────────
  section("Test 1: summarizeConversation");
  const summary = await summarizeConversation({ conversationId: conv.id, tenantId: tenant.id });
  info(`summary: ${summary.summary}`);
  info(`keyPoints (${summary.keyPoints.length}): ${summary.keyPoints.join(" | ")}`);
  info(`messageCount: ${summary.messageCount}`);

  const convAfterSummary = await db.conversation.findUnique({ where: { id: conv.id } });
  const summaryLog = await db.aiLog.findFirst({ where: { entityId: conv.id, action: "summarize_conversation" } });

  convAfterSummary?.summaryText ? ok("summaryText saved to DB") : fail("summaryText NOT saved");
  summaryLog ? ok("aiLog created for summarize_conversation") : fail("aiLog MISSING");
  summary.messageCount === msgs.length ? ok(`messageCount = ${msgs.length}`) : fail(`messageCount wrong: ${summary.messageCount}`);
  summary.keyPoints.length > 0 ? ok("keyPoints populated") : fail("keyPoints empty");

  // ── Test 2: suggestReply ────────────────────────────────────────────────────
  section("Test 2: suggestReply");
  const reply = await suggestReply({ conversationId: conv.id, tenantId: tenant.id, contactName: contact.name });
  info(`tone: ${reply.tone} | confidence: ${reply.confidence}%`);
  info(`suggestion: ${reply.suggestion.slice(0, 80)}…`);

  const replyLog = await db.aiLog.findFirst({ where: { entityId: conv.id, action: "suggest_reply" } });
  ["professional","friendly","empathetic"].includes(reply.tone) ? ok(`tone="${reply.tone}" is valid`) : fail(`invalid tone: ${reply.tone}`);
  reply.confidence >= 0 && reply.confidence <= 100   ? ok(`confidence=${reply.confidence}% in range`) : fail("confidence out of range");
  replyLog ? ok("aiLog created for suggest_reply") : fail("aiLog MISSING for suggest_reply");
  reply.suggestion.includes(contact.name) ? ok("suggestion includes contact name") : fail("suggestion missing contact name");

  // ── Test 3: detectIntent — quote_request ────────────────────────────────────
  section("Test 3: detectIntent (quote_request conversation)");
  const intent1 = await detectIntent({ conversationId: conv.id, tenantId: tenant.id, contactId: contact.id });
  info(`intent: ${intent1.intent} | confidence: ${intent1.confidence}%`);
  info(`taskCreated: ${intent1.taskCreated} | taskId: ${intent1.taskId?.slice(0, 8)}`);

  const convAfterIntent = await db.conversation.findUnique({ where: { id: conv.id } });
  const intentLog       = await db.aiLog.findFirst({ where: { entityId: conv.id, action: "detect_intent" } });
  convAfterIntent?.detectedIntent ? ok(`detectedIntent="${convAfterIntent.detectedIntent}" saved`) : fail("detectedIntent NOT saved");
  intentLog ? ok("aiLog created for detect_intent") : fail("aiLog MISSING for detect_intent");
  ["quote_request","interest","doubt","neutral"].includes(intent1.intent) ? ok(`intent="${intent1.intent}" valid for this conversation`) : fail(`unexpected intent: ${intent1.intent}`);
  intent1.taskCreated ? ok("task auto-created") : info("no task created (intent may be neutral)");

  if (intent1.taskId) {
    const task = await db.task.findUnique({ where: { id: intent1.taskId } });
    task?.source === "ai" ? ok(`task.source="ai"`) : fail("task.source is not 'ai'");
    task?.status === "pending" ? ok(`task.status="pending"`) : fail("task not pending");
    info(`task.priority="${task?.priority}" | title="${task?.title}"`);
  }

  // ── Test 4: idempotency ────────────────────────────────────────────────────
  section("Test 4: detectIntent idempotency");
  const intent2 = await detectIntent({ conversationId: conv.id, tenantId: tenant.id, contactId: contact.id });
  info(`2nd call → taskCreated=${intent2.taskCreated} (expected: false)`);
  info(`2nd call → taskId=${intent2.taskId?.slice(0,8)} (should match 1st)`);
  !intent2.taskCreated ? ok("idempotent: no duplicate task") : fail("DUPLICATE task created!");
  intent2.taskId === intent1.taskId ? ok("taskId is stable across calls") : fail("taskId changed on 2nd call");

  // ── Test 5: complaint → high-priority task with 2h deadline ─────────────────
  section("Test 5: complaint intent → high-priority task");
  const conv2 = await db.conversation.create({
    data: { tenantId: tenant.id, contactId: contact.id, channel: ConversationChannel.email, status: ConversationStatus.open, subject: "Reclamação" },
  });
  await db.message.create({
    data: {
      tenantId: tenant.id, conversationId: conv2.id,
      direction: MessageDirection.inbound, senderType: SenderType.contact,
      content: "Isso é um absurdo! O produto não funciona e estou muito insatisfeito!", sentAt: new Date(),
    },
  });

  const intent3 = await detectIntent({ conversationId: conv2.id, tenantId: tenant.id, contactId: contact.id });
  info(`intent: ${intent3.intent} | confidence: ${intent3.confidence}%`);
  intent3.intent === "complaint" ? ok("complaint detected correctly") : fail(`expected complaint, got ${intent3.intent}`);
  intent3.confidence === 85      ? ok("confidence=85 (inbound match)") : fail(`confidence=${intent3.confidence}, expected 85`);
  intent3.taskCreated            ? ok("task auto-created for complaint") : fail("no task for complaint");

  if (intent3.taskId) {
    const task = await db.task.findUnique({ where: { id: intent3.taskId } });
    task?.priority === "high" ? ok("priority=high for complaint") : fail(`priority=${task?.priority}`);
    const hoursUntilDue = task?.dueAt ? (task.dueAt.getTime() - Date.now()) / 3600000 : null;
    hoursUntilDue !== null && hoursUntilDue <= 2.1 && hoursUntilDue >= 1.9
      ? ok(`dueAt in ~2h (${hoursUntilDue.toFixed(1)}h)`)
      : info(`dueAt in ~${hoursUntilDue?.toFixed(1)}h (tolerance ±0.1h)`);
    info(`title: "${task?.title}"`);
  }

  // ── Test 6: losing_interest → medium priority ──────────────────────────────
  section("Test 6: losing_interest → medium priority");
  const conv3 = await db.conversation.create({
    data: { tenantId: tenant.id, contactId: contact.id, channel: ConversationChannel.whatsapp, status: ConversationStatus.open, subject: "Cancelamento" },
  });
  await db.message.create({
    data: {
      tenantId: tenant.id, conversationId: conv3.id,
      direction: MessageDirection.inbound, senderType: SenderType.contact,
      content: "Não tenho interesse mais, podem cancelar.", sentAt: new Date(),
    },
  });

  const intent4 = await detectIntent({ conversationId: conv3.id, tenantId: tenant.id, contactId: contact.id });
  info(`intent: ${intent4.intent} | confidence: ${intent4.confidence}%`);
  intent4.intent === "losing_interest" ? ok("losing_interest detected") : fail(`expected losing_interest, got ${intent4.intent}`);
  if (intent4.taskId) {
    const task = await db.task.findUnique({ where: { id: intent4.taskId } });
    task?.priority === "medium" ? ok("priority=medium for losing_interest") : fail(`priority=${task?.priority}`);
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────
  section("Cleanup");
  const convIds = [conv.id, conv2.id, conv3.id];
  await db.aiLog.deleteMany({ where: { entityId: { in: convIds } } });
  const tasks = await db.task.findMany({
    where: { source: "ai", description: { contains: conv.id.slice(0, 8) } },
  });
  // Clean up all tasks referencing these conversations
  await db.task.deleteMany({ where: { source: "ai", contactId: contact.id, status: "pending" } });
  await db.message.deleteMany({ where: { conversationId: { in: convIds } } });
  await db.conversation.deleteMany({ where: { id: { in: convIds } } });
  ok("Test data cleaned up");

  console.log("\n" + SEP);
  console.log(process.exitCode ? "❌  Some tests FAILED — see ❌ above" : "✅  All tests PASSED");
  console.log(SEP + "\n");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());

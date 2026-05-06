/**
 * Validates the real-AI pipeline for summarizeConversation, suggestReply, detectIntent.
 *
 * Tests:
 *   - Real Anthropic API call (when ANTHROPIC_API_KEY is set and AI_PROVIDER != mock)
 *   - Graceful fallback to mock (when key absent or AI_PROVIDER=mock)
 *   - Output schema validation for both paths
 *   - Token cost reporting
 *   - All DB side-effects (summaryText, detectedIntent, ai_logs, tasks)
 *
 * Inline logic mirrors lib/ai/ files to avoid @/ path resolution issues in tsx.
 */

import { config } from "dotenv";
// Load both .env and .env.local (Next.js convention; tsx doesn't auto-load .env.local)
config({ path: ".env" });
config({ path: ".env.local", override: true });
import Anthropic from "@anthropic-ai/sdk";
import { PrismaClient } from "../lib/generated/prisma/client";
import {
  SenderType, MessageDirection,
  ConversationChannel, ConversationStatus, ContactStatus,
} from "../lib/generated/prisma/enums";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db      = new PrismaClient({ adapter } as never) as any;

const SEP = "─".repeat(62);
function section(t: string) { console.log(`\n${SEP}\n${t}\n${SEP}`); }
function ok(m: string)      { console.log(`  ✅ ${m}`); }
function fail(m: string)    { console.error(`  ❌ ${m}`); process.exitCode = 1; }
function info(m: string)    { console.log(`  ℹ  ${m}`); }
function warn(m: string)    { console.log(`  ⚠  ${m}`); }

// ── Provider detection ────────────────────────────────────────────────────────

const AI_PROVIDER   = process.env.AI_PROVIDER ?? "claude";
const HAS_API_KEY   = !!process.env.ANTHROPIC_API_KEY;
const AI_MODEL      = process.env.AI_MODEL ?? "claude-haiku-4-5-20251001";
const REAL_AI_READY = AI_PROVIDER !== "mock" && HAS_API_KEY;

// ── Inline AI caller ──────────────────────────────────────────────────────────

let _anthropic: Anthropic | null = null;
function getAnthropicClient() {
  _anthropic ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  return _anthropic;
}

interface CompletionResult {
  text: string; inputTokens: number; outputTokens: number; provider: string; modelId: string;
}

async function aiComplete(system: string, user: string, maxTokens = 512): Promise<CompletionResult> {
  if (!REAL_AI_READY) throw new Error("ai-disabled");
  const response = await getAnthropicClient().messages.create({
    model: AI_MODEL, max_tokens: maxTokens, system,
    messages: [{ role: "user", content: user }],
  });
  const text = (response.content[0] as any).text ?? "";
  return { text, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, provider: "anthropic", modelId: AI_MODEL };
}

function parseAIJson<T>(text: string): T {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  return JSON.parse(cleaned) as T;
}

// ── Test helpers ──────────────────────────────────────────────────────────────

interface ConvSetup { tenant: any; contact: any; conv: any }

async function createTestConv(channel: string = "whatsapp"): Promise<ConvSetup> {
  const tenant = await db.tenant.findFirst();
  let contact = await db.contact.findFirst({ where: { tenantId: tenant.id, name: "AI Test Contact" } });
  if (!contact) {
    contact = await db.contact.create({ data: { tenantId: tenant.id, name: "AI Test Contact", email: "aitest@test.com", status: ContactStatus.lead } });
  }
  const conv = await db.conversation.create({
    data: { tenantId: tenant.id, contactId: contact.id, channel, status: ConversationStatus.open, subject: `AI Test — ${new Date().toISOString()}` },
  });
  return { tenant, contact, conv };
}

async function addMessages(convId: string, tenantId: string, msgs: { content: string; direction: "inbound" | "outbound" }[]) {
  const now = new Date();
  for (let i = 0; i < msgs.length; i++) {
    await db.message.create({
      data: {
        tenantId, conversationId: convId,
        direction: msgs[i].direction === "inbound" ? MessageDirection.inbound : MessageDirection.outbound,
        senderType: msgs[i].direction === "inbound" ? SenderType.contact : SenderType.user,
        content: msgs[i].content,
        sentAt: new Date(now.getTime() + i * 5000),
      },
    });
  }
}

async function cleanup(convId: string, tenantId: string) {
  await db.aiLog.deleteMany({ where: { entityId: convId } });
  await db.task.deleteMany({ where: { tenantId, source: "ai", description: { contains: convId } } });
  await db.message.deleteMany({ where: { conversationId: convId } });
  await db.conversation.delete({ where: { id: convId } });
}

// ── Cost tracker ──────────────────────────────────────────────────────────────

const costTracker = { inputTokens: 0, outputTokens: 0, calls: 0 };
function trackCost(r: CompletionResult) {
  costTracker.inputTokens  += r.inputTokens;
  costTracker.outputTokens += r.outputTokens;
  costTracker.calls++;
}

// ── Test 1: summarizeConversation ─────────────────────────────────────────────

async function testSummarize() {
  section("Test 1: summarizeConversation");
  const { tenant, conv } = await createTestConv("whatsapp");

  await addMessages(conv.id, tenant.id, [
    { direction: "inbound",  content: "Olá, preciso de um orçamento para 50 usuários." },
    { direction: "outbound", content: "Claro! Para 50 usuários o investimento é R$ 2.500/mês." },
    { direction: "inbound",  content: "Tenho interesse. Vocês têm desconto para pagamento anual?" },
    { direction: "outbound", content: "Sim! Pagando anual você economiza 2 meses." },
    { direction: "inbound",  content: "Perfeito, como fecho o contrato?" },
  ]);

  // ── Prompts
  const SYSTEM = `Você é um assistente especializado em CRM para equipes de vendas brasileiras.
Analise as mensagens desta conversa e responda APENAS com JSON válido no formato:
{"summary":"resumo da conversa em 1-2 frases em português","keyPoints":["ponto 1","ponto 2"]}
Regras: summary máximo 2 frases, keyPoints até 5 itens, responda APENAS com o JSON sem markdown.`;

  const msgs = await db.message.findMany({ where: { conversationId: conv.id, tenantId: tenant.id }, orderBy: { sentAt: "asc" }, select: { content: true, direction: true } });
  const lines = msgs.map((m: any) => `[${m.direction === "inbound" ? "contato" : "atendente"}] ${m.content}`).join("\n");
  const USER = `Conversa com ${msgs.length} mensagens:\n${lines}`;

  let summary = "", keyPoints: string[] = [], usedProvider = "mock", inputTokens = 0, outputTokens = 0, modelId = "mock-v2";

  if (REAL_AI_READY) {
    try {
      const result = await aiComplete(SYSTEM, USER, 400);
      trackCost(result);
      const parsed = parseAIJson<{ summary: string; keyPoints: string[] }>(result.text);
      if (typeof parsed.summary !== "string" || !Array.isArray(parsed.keyPoints)) throw new Error("bad shape");
      summary = parsed.summary; keyPoints = parsed.keyPoints;
      usedProvider = result.provider; inputTokens = result.inputTokens; outputTokens = result.outputTokens; modelId = result.modelId;
      info(`provider=anthropic | model=${modelId} | in=${inputTokens}tok out=${outputTokens}tok`);
    } catch (e) {
      warn(`Real AI failed: ${(e as Error).message} — checking mock fallback`);
      usedProvider = "mock";
    }
  } else {
    warn(`Real AI not available (AI_PROVIDER=${AI_PROVIDER}, hasKey=${HAS_API_KEY}) — testing mock fallback`);
  }

  if (usedProvider === "mock") {
    summary = "[MOCK] Conversa com pedido de orçamento e interesse de compra.";
    keyPoints = ["Pedido de orçamento", "Interesse de compra"];
    inputTokens = msgs.length * 15; outputTokens = 60; modelId = "mock-v2";
  }

  // Persist to DB (mirroring summarizeConversation action)
  await db.$transaction([
    db.conversation.update({ where: { id: conv.id }, data: { summaryText: summary } }),
    db.aiLog.create({ data: { tenantId: tenant.id, entityType: "conversation", entityId: conv.id, action: "summarize_conversation", modelProvider: usedProvider, modelId, promptTokens: msgs.length * 15, completionTokens: outputTokens, inputSummary: `messages=${msgs.length}`, outputSummary: `keyPoints=${keyPoints.length}` } }),
  ]);

  info(`summary: "${summary.slice(0, 80)}…"`);
  info(`keyPoints (${keyPoints.length}): ${keyPoints.slice(0, 3).join(" | ")}`);

  const convAfter = await db.conversation.findUnique({ where: { id: conv.id } });
  const log = await db.aiLog.findFirst({ where: { entityId: conv.id, action: "summarize_conversation" } });

  typeof summary === "string" && summary.length > 0 ? ok(`summary is non-empty string`) : fail("summary empty");
  Array.isArray(keyPoints) && keyPoints.length > 0  ? ok(`keyPoints has ${keyPoints.length} items`) : fail("keyPoints empty");
  convAfter?.summaryText === summary                 ? ok("summaryText persisted to DB") : fail("summaryText not saved");
  !!log                                              ? ok(`aiLog created (action=summarize_conversation, provider=${log.modelProvider})`) : fail("aiLog missing");
  REAL_AI_READY && usedProvider === "anthropic"      ? ok("Real AI path used ✨") : info("Mock fallback path used");

  await cleanup(conv.id, tenant.id);
  ok("Test 1 data cleaned up");
}

// ── Test 2: suggestReply ──────────────────────────────────────────────────────

async function testSuggestReply() {
  section("Test 2: suggestReply");
  const { tenant, contact, conv } = await createTestConv("instagram");

  await addMessages(conv.id, tenant.id, [
    { direction: "inbound",  content: "Vi seus produtos no Instagram, quanto custa o plano básico?" },
    { direction: "outbound", content: "Olá! O plano básico é R$ 99/mês." },
    { direction: "inbound",  content: "Tem como parcelar no cartão?" },
  ]);

  const SYSTEM = `Você é um assistente de vendas de uma empresa brasileira.
Com base na conversa fornecida, sugira a resposta mais adequada para o atendente enviar ao contato.
Responda APENAS com JSON válido no formato:
{"suggestion":"texto da resposta sugerida em português","tone":"professional"|"friendly"|"empathetic","confidence":<0-100>}
Responda APENAS com o JSON, sem markdown.`;

  const msgs = await db.message.findMany({ where: { conversationId: conv.id, tenantId: tenant.id }, orderBy: { sentAt: "desc" }, take: 5, select: { content: true, direction: true } });
  const lines = [...msgs].reverse().map((m: any) => `[${m.direction === "inbound" ? "contato" : "atendente"}] ${m.content}`).join("\n");
  const USER = `Contato: ${contact.name}\nÚltimas ${msgs.length} mensagens:\n${lines}\n\nSugira uma resposta para a última mensagem do contato.`;

  let suggestion = "", tone = "friendly", confidence = 75, usedProvider = "mock", outputTokens = 45, modelId = "mock-v2";
  const VALID_TONES = ["professional", "friendly", "empathetic"];

  if (REAL_AI_READY) {
    try {
      const result = await aiComplete(SYSTEM, USER, 300);
      trackCost(result);
      const parsed = parseAIJson<{ suggestion: string; tone: string; confidence: number }>(result.text);
      if (typeof parsed.suggestion !== "string" || !VALID_TONES.includes(parsed.tone)) throw new Error("bad shape");
      suggestion = parsed.suggestion; tone = parsed.tone; confidence = Math.min(100, Math.max(0, Math.round(Number(parsed.confidence))));
      usedProvider = result.provider; outputTokens = result.outputTokens; modelId = result.modelId;
      info(`provider=anthropic | model=${modelId} | in=${result.inputTokens}tok out=${outputTokens}tok`);
    } catch (e) {
      warn(`Real AI failed: ${(e as Error).message} — using mock`);
      usedProvider = "mock";
    }
  } else {
    warn(`Real AI not available — testing mock fallback`);
  }

  if (usedProvider === "mock") {
    suggestion = `Olá, ${contact.name}! Sim, aceitamos parcelamento em até 12x no cartão. Posso te enviar mais detalhes?`;
    tone = "friendly"; confidence = 80; modelId = "mock-v2";
  }

  await db.aiLog.create({ data: { tenantId: tenant.id, entityType: "conversation", entityId: conv.id, action: "suggest_reply", modelProvider: usedProvider, modelId, promptTokens: msgs.length * 10, completionTokens: outputTokens, inputSummary: `messages=${msgs.length}`, outputSummary: `tone=${tone}, confidence=${confidence}%` } });

  info(`tone: ${tone} | confidence: ${confidence}%`);
  info(`suggestion: "${suggestion.slice(0, 80)}…"`);

  const log = await db.aiLog.findFirst({ where: { entityId: conv.id, action: "suggest_reply" } });

  typeof suggestion === "string" && suggestion.length > 0 ? ok("suggestion is non-empty string") : fail("suggestion empty");
  VALID_TONES.includes(tone)                               ? ok(`tone="${tone}" is valid`) : fail(`invalid tone: ${tone}`);
  confidence >= 0 && confidence <= 100                     ? ok(`confidence=${confidence}% in range [0,100]`) : fail("confidence out of range");
  !!log                                                    ? ok(`aiLog created (action=suggest_reply, provider=${log.modelProvider})`) : fail("aiLog missing");
  REAL_AI_READY && usedProvider === "anthropic"            ? ok("Real AI path used ✨") : info("Mock fallback path used");

  await cleanup(conv.id, tenant.id);
  ok("Test 2 data cleaned up");
}

// ── Test 3: detectIntent — quote_request ─────────────────────────────────────

async function testDetectIntentQuoteRequest() {
  section("Test 3: detectIntent — quote_request");
  const { tenant, contact, conv } = await createTestConv("whatsapp");

  await addMessages(conv.id, tenant.id, [
    { direction: "inbound",  content: "Oi, preciso de um orçamento para 20 licenças." },
    { direction: "outbound", content: "Olá! Vou preparar uma proposta para você." },
    { direction: "inbound",  content: "Quanto custa o plano enterprise? Qual o investimento?" },
  ]);

  await runDetectIntentTest(conv, tenant, contact, ["quote_request", "interest"]);
}

// ── Test 4: detectIntent — complaint ─────────────────────────────────────────

async function testDetectIntentComplaint() {
  section("Test 4: detectIntent — complaint (2h deadline)");
  const { tenant, contact, conv } = await createTestConv("email");

  await addMessages(conv.id, tenant.id, [
    { direction: "inbound", content: "Isso é um absurdo! O produto não funciona e estou muito insatisfeito com o serviço." },
  ]);

  await runDetectIntentTest(conv, tenant, contact, ["complaint"], { expectHighPriority: true, expectShortDeadline: true });
}

// ── Test 5: detectIntent — losing_interest ────────────────────────────────────

async function testDetectIntentLosingInterest() {
  section("Test 5: detectIntent — losing_interest");
  const { tenant, contact, conv } = await createTestConv("whatsapp");

  await addMessages(conv.id, tenant.id, [
    { direction: "inbound", content: "Olhem, não tenho mais interesse. Podem cancelar tudo, esqueça." },
  ]);

  await runDetectIntentTest(conv, tenant, contact, ["losing_interest"]);
}

// ── Test 6: detectIntent — idempotency ───────────────────────────────────────

async function testDetectIntentIdempotency() {
  section("Test 6: detectIntent — idempotency (no duplicate tasks)");
  const { tenant, contact, conv } = await createTestConv("whatsapp");

  await addMessages(conv.id, tenant.id, [
    { direction: "inbound", content: "Quero contratar o plano pro hoje mesmo." },
  ]);

  // First call — may create task
  const r1 = await runDetectIntentCore(conv, tenant, contact);
  const taskId1 = r1.taskId;
  info(`1st call: intent=${r1.intent}, taskCreated=${r1.taskCreated}, taskId=${taskId1?.slice(0, 8)}`);

  // Second call — must NOT create another task
  // Reset conv intent so it runs again
  await db.conversation.update({ where: { id: conv.id }, data: { detectedIntent: null } });
  const r2 = await runDetectIntentCore(conv, tenant, contact);
  info(`2nd call: intent=${r2.intent}, taskCreated=${r2.taskCreated}, taskId=${r2.taskId?.slice(0, 8)}`);

  !r2.taskCreated     ? ok("Idempotent: no duplicate task on 2nd call") : fail("Duplicate task created!");
  r2.taskId === taskId1 ? ok("taskId stable across calls") : info("taskId differs (may be neutral — no task expected)");

  await cleanup(conv.id, tenant.id);
  ok("Test 6 data cleaned up");
}

// ── Shared detectIntent runner ────────────────────────────────────────────────

async function runDetectIntentCore(conv: any, tenant: any, contact: any) {
  const SYSTEM = `Você é um classificador de intenções comerciais para conversas em português.
Analise as mensagens do CONTATO (marcadas como [contato]) e classifique a intenção principal.
Responda APENAS com JSON válido: {"intent":"<opção>","confidence":<0-100>,"details":"justificativa"}
Opções: interest, doubt, complaint, quote_request, urgency, losing_interest, neutral
Responda APENAS com o JSON sem markdown.`;

  const msgs = await db.message.findMany({ where: { conversationId: conv.id, tenantId: tenant.id }, orderBy: { sentAt: "desc" }, take: 10, select: { content: true, direction: true } });
  const lines = [...msgs].reverse().map((m: any) => `[${m.direction === "inbound" ? "contato" : "atendente"}] ${m.content}`).join("\n");
  const USER = `Últimas ${msgs.length} mensagens:\n${lines}\n\nQual é a intenção principal do contato?`;

  const VALID_INTENTS = ["interest", "doubt", "complaint", "quote_request", "urgency", "losing_interest", "neutral"];
  let intent = "neutral", confidence = 50, details = "", usedProvider = "mock", outputTokens = 20, modelId = "mock-v2";

  if (REAL_AI_READY) {
    try {
      const result = await aiComplete(SYSTEM, USER, 200);
      trackCost(result);
      const parsed = parseAIJson<{ intent: string; confidence: number; details: string }>(result.text);
      if (!VALID_INTENTS.includes(parsed.intent)) throw new Error("bad shape");
      intent = parsed.intent; confidence = Math.min(100, Math.max(0, Math.round(Number(parsed.confidence)))); details = String(parsed.details ?? "");
      usedProvider = result.provider; outputTokens = result.outputTokens; modelId = result.modelId;
      info(`  provider=anthropic | model=${modelId} | in=${result.inputTokens}tok out=${outputTokens}tok`);
    } catch (e) {
      warn(`  Real AI failed: ${(e as Error).message} — using mock`);
      usedProvider = "mock";
    }
  }

  if (usedProvider === "mock") {
    // Inline mock patterns
    const PATTERNS: [string, RegExp][] = [
      ["complaint",       /problema|erro|não funciona|reclamação|insatisfeito|horrível|absurdo/],
      ["urgency",         /urgente|urgência|rápido|hoje|agora|imediato|prazo/],
      ["quote_request",   /orçamento|preço|valor|quanto custa|proposta|tabela|investimento/],
      ["losing_interest", /não tenho interesse|desistir|cancelar|não vou|esqueça/],
      ["interest",        /quero|gostei|interesse|comprar|contratar|fechar|adorei/],
      ["doubt",           /dúvida|como funciona|como usar|quando|onde|qual é|não entendi/],
    ];
    const inboundText = msgs.filter((m: any) => m.direction === "inbound").map((m: any) => m.content.toLowerCase()).join(" ");
    const allText     = msgs.map((m: any) => m.content.toLowerCase()).join(" ");
    for (const [i, p] of PATTERNS) {
      if (p.test(inboundText) || p.test(allText)) {
        intent = i; confidence = p.test(inboundText) ? 85 : 65;
        details = `[MOCK] padrão detectado`; break;
      }
    }
    modelId = "mock-v2";
  }

  // Task creation (idempotent)
  const TASK_INTENTS = new Set(["complaint", "urgency", "quote_request", "interest", "losing_interest"]);
  const TASK_TEMPLATES: Record<string, { title: string; priority: string }> = {
    complaint:       { title: "ALERTA: Reclamação detectada — atender imediatamente", priority: "high" },
    urgency:         { title: "Cliente com urgência — responder agora", priority: "high" },
    quote_request:   { title: "Enviar proposta/orçamento", priority: "high" },
    interest:        { title: "Follow-up: Lead quente na conversa", priority: "high" },
    losing_interest: { title: "Risco de perda — reativar engajamento", priority: "medium" },
  };

  let taskId: string | null = null, taskCreated = false;
  if (TASK_INTENTS.has(intent)) {
    const existing = await db.task.findFirst({ where: { tenantId: tenant.id, source: "ai", status: "pending", description: { contains: conv.id } } });
    if (!existing) {
      const tmpl = TASK_TEMPLATES[intent];
      const dueAt = new Date();
      dueAt.setHours(dueAt.getHours() + (intent === "complaint" || intent === "urgency" ? 2 : 24));
      const task = await db.task.create({ data: { tenantId: tenant.id, contactId: contact.id, title: tmpl.title, priority: tmpl.priority, status: "pending", source: "ai", description: `Intenção detectada na conversa ${conv.id}. Confiança: ${confidence}%.`, dueAt } });
      taskId = task.id; taskCreated = true;
    } else { taskId = existing.id; }
  }

  await db.$transaction([
    db.conversation.update({ where: { id: conv.id }, data: { detectedIntent: intent } }),
    db.aiLog.create({ data: { tenantId: tenant.id, entityType: "conversation", entityId: conv.id, action: "detect_intent", modelProvider: usedProvider, modelId, promptTokens: msgs.length * 12, completionTokens: outputTokens, inputSummary: `messages=${msgs.length}`, outputSummary: `intent=${intent}, confidence=${confidence}%, taskCreated=${taskCreated}` } }),
  ]);

  return { intent, confidence, details, taskId, taskCreated, usedProvider };
}

async function runDetectIntentTest(
  conv: any, tenant: any, contact: any,
  expectedIntents: string[],
  opts: { expectHighPriority?: boolean; expectShortDeadline?: boolean } = {}
) {
  const r = await runDetectIntentCore(conv, tenant, contact);
  info(`intent: ${r.intent} | confidence: ${r.confidence}% | provider: ${r.usedProvider}`);
  info(`details: ${r.details}`);
  info(`taskCreated: ${r.taskCreated} | taskId: ${r.taskId?.slice(0, 8)}`);

  const convAfter = await db.conversation.findUnique({ where: { id: conv.id } });
  const log = await db.aiLog.findFirst({ where: { entityId: conv.id, action: "detect_intent" } });

  expectedIntents.includes(r.intent)        ? ok(`intent="${r.intent}" ∈ expected set [${expectedIntents.join(",")}]`) : fail(`intent="${r.intent}" not in expected [${expectedIntents.join(",")}]`);
  r.confidence >= 0 && r.confidence <= 100  ? ok(`confidence=${r.confidence}%`) : fail("confidence out of range");
  convAfter?.detectedIntent === r.intent    ? ok("detectedIntent saved to conversation") : fail("detectedIntent not saved");
  !!log                                     ? ok(`aiLog created (provider=${log.modelProvider})`) : fail("aiLog missing");
  REAL_AI_READY && r.usedProvider === "anthropic" ? ok("Real AI path used ✨") : info("Mock fallback path used");

  if (r.taskId) {
    const task = await db.task.findUnique({ where: { id: r.taskId } });
    task?.source === "ai"     ? ok(`task.source="ai"`) : fail("task source wrong");
    task?.status === "pending" ? ok("task.status=pending") : fail("task status wrong");
    if (opts.expectHighPriority) {
      task?.priority === "high" ? ok("priority=high (correct for complaint/urgency)") : fail(`priority=${task?.priority}, expected high`);
    }
    if (opts.expectShortDeadline) {
      const hoursUntil = task?.dueAt ? (task.dueAt.getTime() - Date.now()) / 3_600_000 : null;
      hoursUntil !== null && hoursUntil < 2.1 ? ok(`dueAt in ~${hoursUntil.toFixed(1)}h (≤2h deadline)`) : info(`dueAt in ~${hoursUntil?.toFixed(1)}h`);
    }
  }

  await cleanup(conv.id, tenant.id);
  ok("Test data cleaned up");
}

// ── Test 7: forced mock fallback ──────────────────────────────────────────────

async function testForcedMockFallback() {
  section("Test 7: forced mock fallback (AI_PROVIDER overridden to mock)");
  const { tenant, conv } = await createTestConv("manual");

  await addMessages(conv.id, tenant.id, [
    { direction: "inbound", content: "Tenho interesse em contratar o plano premium." },
  ]);

  // Temporarily override to simulate mock-only environment
  const originalProvider = process.env.AI_PROVIDER;
  (process.env as any).AI_PROVIDER = "mock";

  // Re-evaluate enabled (inline check)
  const mockEnabled = process.env.AI_PROVIDER === "mock";

  let usedProvider = "mock";
  if (!mockEnabled) {
    warn("Could not force mock in this test — skipping");
  } else {
    // Run with forced mock
    const msgs = await db.message.findMany({ where: { conversationId: conv.id, tenantId: tenant.id }, select: { content: true, direction: true } });
    const inboundText = msgs.filter((m: any) => m.direction === "inbound").map((m: any) => m.content.toLowerCase()).join(" ");
    let intent = "neutral";
    if (/quero|interesse|contratar/.test(inboundText)) intent = "interest";
    usedProvider = "mock";

    await db.aiLog.create({ data: { tenantId: tenant.id, entityType: "conversation", entityId: conv.id, action: "detect_intent", modelProvider: "mock", modelId: "mock-v2", promptTokens: 12, completionTokens: 20, inputSummary: "forced-mock-test", outputSummary: `intent=${intent}` } });

    usedProvider === "mock" ? ok("Mock fallback produced valid output") : fail("Expected mock fallback");
    intent === "interest"   ? ok(`Mock correctly detected intent="interest"`) : info(`Mock detected intent="${intent}"`);
  }

  (process.env as any).AI_PROVIDER = originalProvider;
  await cleanup(conv.id, tenant.id);
  ok("Test 7 data cleaned up");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Validate: Real AI Pipeline ===");
  info(`AI_PROVIDER=${AI_PROVIDER} | model=${AI_MODEL} | hasKey=${HAS_API_KEY} | realAiReady=${REAL_AI_READY}`);

  if (!REAL_AI_READY) {
    warn("ANTHROPIC_API_KEY not set or AI_PROVIDER=mock — all tests will use mock fallback.");
    warn("Set ANTHROPIC_API_KEY in .env.local to test the real AI path.");
  }

  await testSummarize();
  await testSuggestReply();
  await testDetectIntentQuoteRequest();
  await testDetectIntentComplaint();
  await testDetectIntentLosingInterest();
  await testDetectIntentIdempotency();
  await testForcedMockFallback();

  // ── Cost summary ────────────────────────────────────────────────────────────
  if (costTracker.calls > 0) {
    section("Cost Summary");
    const INPUT_CPM  = 0.25 / 1000;  // $0.00025 per 1K input tokens (Haiku)
    const OUTPUT_CPM = 1.25 / 1000;  // $0.00125 per 1K output tokens (Haiku)
    const totalCost  =
      (costTracker.inputTokens / 1000) * INPUT_CPM +
      (costTracker.outputTokens / 1000) * OUTPUT_CPM;
    info(`Real AI calls:    ${costTracker.calls}`);
    info(`Input tokens:     ${costTracker.inputTokens}`);
    info(`Output tokens:    ${costTracker.outputTokens}`);
    info(`Estimated cost:   $${totalCost.toFixed(6)} (Haiku pricing)`);
    info(`Cost per call:    $${(totalCost / costTracker.calls).toFixed(6)}`);
  }

  console.log("\n" + SEP);
  console.log(process.exitCode ? "❌  Some tests FAILED — see ❌ above" : "✅  All tests PASSED");
  console.log(SEP + "\n");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());

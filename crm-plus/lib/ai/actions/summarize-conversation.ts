import { prisma } from "@/lib/db/client";
import { aiComplete, parseAIJson } from "@/lib/ai/provider";

export interface SummarizeConversationInput {
  conversationId: string;
  tenantId:       string;
  userId?:        string;
}

export interface SummarizeConversationResult {
  summary:      string;
  keyPoints:    string[];
  messageCount: number;
  lastUpdated:  Date;
}

// ── Prompts ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `\
Você é um assistente especializado em CRM para equipes de vendas brasileiras.
Analise as mensagens desta conversa e responda APENAS com JSON válido no formato:
{
  "summary": "resumo da conversa em 1-2 frases em português",
  "keyPoints": ["ponto 1", "ponto 2"]
}
Regras:
- "summary": máximo 2 frases, focado em contexto comercial
- "keyPoints": até 5 strings, cada uma com um insight relevante (intenção de compra, problema, urgência, orçamento, dúvida)
- Se a conversa não tiver pontos relevantes, "keyPoints" deve ter um item genérico
- Responda APENAS com o JSON, sem markdown, sem texto adicional`;

function buildUserPrompt(
  messages: { direction: string; content: string }[]
): string {
  const lines = messages
    .map((m) => `[${m.direction === "inbound" ? "contato" : "atendente"}] ${m.content}`)
    .join("\n");
  return `Conversa com ${messages.length} mensagens:\n${lines}`;
}

// ── Mock fallback ─────────────────────────────────────────────────────────────

interface MockResult { summary: string; keyPoints: string[] }

function mockSummarize(
  messages: { direction: string; content: string; sentAt: Date }[]
): MockResult {
  const allText  = messages.map((m) => m.content.toLowerCase()).join(" ");
  const inbound  = messages.filter((m) => m.direction === "inbound");
  const outbound = messages.filter((m) => m.direction === "outbound");

  const keyPoints: string[] = [];
  if (/orçamento|preço|valor|quanto custa|proposta/.test(allText))
    keyPoints.push("Cliente solicitou informações de preço/orçamento");
  if (/problema|erro|não funciona|reclamação|insatisfeito/.test(allText))
    keyPoints.push("Registro de problema ou reclamação identificado");
  if (/urgente|rápido|hoje|agora|imediato/.test(allText))
    keyPoints.push("Cliente demonstra urgência");
  if (/quero|gostei|interesse|comprar|contratar/.test(allText))
    keyPoints.push("Interesse de compra detectado");
  if (/não tenho interesse|desistir|cancelar|não vou/.test(allText))
    keyPoints.push("Possível perda de interesse");
  if (/dúvida|como|quando|onde|qual|entender/.test(allText))
    keyPoints.push("Dúvidas técnicas ou de processo identificadas");
  if (keyPoints.length === 0)
    keyPoints.push("Conversa em andamento sem sinais específicos detectados");

  const first = messages[0];
  const last  = messages[messages.length - 1];
  const summary =
    `[MOCK] Conversa com ${messages.length} mensagens — ` +
    `${inbound.length} recebidas, ${outbound.length} enviadas. ` +
    `Início: "${first.content.slice(0, 60)}${first.content.length > 60 ? "..." : ""}". ` +
    `Última: "${last.content.slice(0, 60)}${last.content.length > 60 ? "..." : ""}".`;

  return { summary, keyPoints };
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function summarizeConversation(
  input: SummarizeConversationInput
): Promise<SummarizeConversationResult> {
  const messages = await prisma.message.findMany({
    where:   { conversationId: input.conversationId, tenantId: input.tenantId },
    orderBy: { sentAt: "asc" },
    select:  { content: true, direction: true, senderType: true, sentAt: true },
  });

  if (messages.length === 0) {
    return { summary: "Conversa sem mensagens ainda.", keyPoints: [], messageCount: 0, lastUpdated: new Date() };
  }

  // ── AI inference (real → mock fallback) ──────────────────────────────────────
  let summary:      string;
  let keyPoints:    string[];
  let inputTokens:  number;
  let outputTokens: number;
  let modelProvider = "mock";
  let modelId       = "mock-v2";

  try {
    const result = await aiComplete({
      system:    SYSTEM_PROMPT,
      user:      buildUserPrompt(messages),
      maxTokens: 400,
    });

    const parsed = parseAIJson<{ summary: string; keyPoints: string[] }>(result.text);

    // Validate shape
    if (typeof parsed.summary !== "string" || !Array.isArray(parsed.keyPoints)) {
      throw new Error("unexpected-ai-shape");
    }

    summary       = parsed.summary;
    keyPoints     = parsed.keyPoints.slice(0, 5).map(String);
    inputTokens   = result.inputTokens;
    outputTokens  = result.outputTokens;
    modelProvider = result.provider;
    modelId       = result.modelId;
  } catch {
    // AI unavailable, disabled, or returned invalid JSON → use mock
    const mock = mockSummarize(messages);
    summary      = mock.summary;
    keyPoints    = mock.keyPoints;
    inputTokens  = messages.length * 15;
    outputTokens = 60;
  }

  const lastUpdated = new Date();

  // ── Persist ──────────────────────────────────────────────────────────────────
  await prisma.$transaction([
    prisma.conversation.update({
      where: { id: input.conversationId },
      data:  { summaryText: summary },
    }),
    prisma.aiLog.create({
      data: {
        tenantId:         input.tenantId,
        userId:           input.userId ?? null,
        entityType:       "conversation",
        entityId:         input.conversationId,
        action:           "summarize_conversation",
        modelProvider,
        modelId,
        promptTokens:     messages.length * 15,  // estimate for billing approximation
        completionTokens: outputTokens,
        inputSummary:  `messages=${messages.length}, inbound=${messages.filter((m) => m.direction === "inbound").length}, outbound=${messages.filter((m) => m.direction === "outbound").length}`,
        outputSummary: `keyPoints=${keyPoints.length}: ${keyPoints.join(" | ")}`,
      },
    }),
  ]);

  return { summary, keyPoints, messageCount: messages.length, lastUpdated };
}

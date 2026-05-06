import { prisma } from "@/lib/db/client";
import { aiComplete, parseAIJson } from "@/lib/ai/provider";

export interface SuggestReplyInput {
  conversationId: string;
  tenantId:       string;
  userId?:        string;
  contactName?:   string;
}

export interface SuggestReplyResult {
  suggestion: string;
  tone:       "professional" | "friendly" | "empathetic";
  confidence: number;
}

// ── Prompts ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `\
Você é um assistente de vendas de uma empresa brasileira.
Com base na conversa fornecida, sugira a resposta mais adequada para o atendente enviar ao contato.
Responda APENAS com JSON válido no formato:
{
  "suggestion": "texto da resposta sugerida em português",
  "tone": "professional" | "friendly" | "empathetic",
  "confidence": <número inteiro de 0 a 100>
}
Critérios para escolha do tom:
- "professional": orçamentos, contratos, negociações, informações formais
- "empathetic": reclamações, problemas, insatisfação, situações delicadas
- "friendly": dúvidas gerais, interesse inicial, conversas casuais
Regras:
- A resposta deve ser natural e adequada ao contexto brasileiro
- Não inclua saudação redundante se a conversa já foi iniciada
- Confidence reflete o quanto você tem certeza que essa é a melhor abordagem
- Responda APENAS com o JSON, sem markdown, sem texto adicional`;

function buildUserPrompt(
  messages: { direction: string; content: string }[],
  contactName?: string
): string {
  const name  = contactName ? `Contato: ${contactName}\n` : "";
  const lines = messages
    .map((m) => `[${m.direction === "inbound" ? "contato" : "atendente"}] ${m.content}`)
    .join("\n");
  return `${name}Últimas ${messages.length} mensagens da conversa:\n${lines}\n\nSugira uma resposta para a última mensagem do contato.`;
}

// ── Mock fallback ─────────────────────────────────────────────────────────────

function mockSuggestReply(
  messages:     { direction: string; content: string }[],
  contactName?: string
): SuggestReplyResult {
  const reversed    = [...messages].reverse();
  const lastInbound = reversed.find((m) => m.direction === "inbound");
  const lastText    = lastInbound?.content.toLowerCase() ?? "";
  const name        = contactName ? `, ${contactName.split(" ")[0]}` : "";

  if (/orçamento|preço|valor|quanto custa|proposta/.test(lastText))
    return { tone: "professional", confidence: 85,
      suggestion: `Olá${name}! Obrigado pelo interesse. Vou preparar uma proposta personalizada para você e envio em breve. Poderia me informar o volume/quantidade que precisa para adequarmos melhor o valor?` };
  if (/problema|erro|não funciona|reclamação|insatisfeito/.test(lastText))
    return { tone: "empathetic", confidence: 80,
      suggestion: `Entendo sua situação${name} e lamento pelo inconveniente. Vou verificar isso com prioridade agora. Pode me passar mais detalhes para eu resolver rapidamente?` };
  if (/urgente|rápido|hoje|agora|imediato/.test(lastText))
    return { tone: "professional", confidence: 82,
      suggestion: `Entendido${name}! Estou priorizando seu caso agora mesmo. Em quantos minutos posso retornar com uma resposta definitiva?` };
  if (/quero|gostei|interesse|comprar|contratar/.test(lastText))
    return { tone: "friendly", confidence: 88,
      suggestion: `Que ótima notícia${name}! Fico feliz com o seu interesse. Posso agendar uma demonstração rápida para apresentar todos os detalhes e tirar suas dúvidas?` };
  if (/dúvida|como|quando|onde|qual|entender/.test(lastText))
    return { tone: "friendly", confidence: 75,
      suggestion: `Boa pergunta${name}! Deixa eu explicar: [complete com a resposta específica]. Ficou claro? Qualquer outra dúvida, estou à disposição!` };
  if (!lastInbound)
    return { tone: "friendly", confidence: 70, suggestion: `Olá${name}! Como posso ajudá-lo hoje?` };
  return { tone: "professional", confidence: 72,
    suggestion: `Obrigado pelo contato${name}! Estou analisando sua mensagem e retorno em instantes com a melhor solução para você.` };
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function suggestReply(
  input: SuggestReplyInput
): Promise<SuggestReplyResult> {
  const messages = await prisma.message.findMany({
    where:   { conversationId: input.conversationId, tenantId: input.tenantId },
    orderBy: { sentAt: "desc" },
    take:    5,
    select:  { content: true, direction: true, senderType: true },
  });

  // ── AI inference (real → mock fallback) ──────────────────────────────────────
  let suggestion:   string;
  let tone:         SuggestReplyResult["tone"];
  let confidence:   number;
  let outputTokens: number;
  let modelProvider = "mock";
  let modelId       = "mock-v2";

  const orderedMessages = [...messages].reverse(); // chronological for prompt

  try {
    const result = await aiComplete({
      system:    SYSTEM_PROMPT,
      user:      buildUserPrompt(orderedMessages, input.contactName),
      maxTokens: 300,
    });

    const parsed = parseAIJson<{
      suggestion: string;
      tone:       string;
      confidence: number;
    }>(result.text);

    const VALID_TONES = ["professional", "friendly", "empathetic"] as const;
    if (
      typeof parsed.suggestion !== "string"  ||
      !VALID_TONES.includes(parsed.tone as typeof VALID_TONES[number])
    ) {
      throw new Error("unexpected-ai-shape");
    }

    suggestion    = parsed.suggestion;
    tone          = parsed.tone as SuggestReplyResult["tone"];
    confidence    = Math.min(100, Math.max(0, Math.round(Number(parsed.confidence))));
    outputTokens  = result.outputTokens;
    modelProvider = result.provider;
    modelId       = result.modelId;
  } catch {
    const mock = mockSuggestReply(orderedMessages, input.contactName);
    suggestion   = mock.suggestion;
    tone         = mock.tone;
    confidence   = mock.confidence;
    outputTokens = 45;
  }

  // ── Log ──────────────────────────────────────────────────────────────────────
  await prisma.aiLog.create({
    data: {
      tenantId:         input.tenantId,
      userId:           input.userId ?? null,
      entityType:       "conversation",
      entityId:         input.conversationId,
      action:           "suggest_reply",
      modelProvider,
      modelId,
      promptTokens:     messages.length * 10,
      completionTokens: outputTokens,
      inputSummary:     `messages=${messages.length}, contact="${input.contactName ?? "unknown"}"`,
      outputSummary:    `tone=${tone}, confidence=${confidence}%`,
    },
  });

  return { suggestion, tone, confidence };
}

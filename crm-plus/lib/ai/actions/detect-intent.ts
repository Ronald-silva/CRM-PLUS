import { prisma } from "@/lib/db/client";
import { aiComplete, parseAIJson } from "@/lib/ai/provider";

export type IntentType =
  | "interest"
  | "doubt"
  | "complaint"
  | "quote_request"
  | "urgency"
  | "losing_interest"
  | "neutral";

export interface DetectIntentInput {
  conversationId: string;
  tenantId:       string;
  userId?:        string;
  contactId?:     string;
}

export interface DetectIntentResult {
  intent:      IntentType;
  confidence:  number;
  details:     string;
  taskId:      string | null;
  taskCreated: boolean;
}

// ── Prompts ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `\
Você é um classificador de intenções comerciais para conversas em português.
Analise as mensagens do CONTATO (marcadas como [contato]) e classifique a intenção principal.
Responda APENAS com JSON válido no formato:
{
  "intent": "<opção abaixo>",
  "confidence": <número inteiro de 0 a 100>,
  "details": "breve justificativa em português (máx 100 caracteres)"
}
Opções de intenção (escolha exatamente uma):
- "interest": demonstra interesse em comprar, contratar ou fechar negócio
- "doubt": tem dúvidas sobre produto, serviço, prazo ou processo
- "complaint": reclama, está insatisfeito, relata problema ou erro
- "quote_request": pede preço, orçamento, proposta, tabela de preços ou investimento
- "urgency": precisa de resposta urgente, tem prazo, deadline ou necessidade imediata
- "losing_interest": desiste, quer cancelar, diz que não tem interesse ou encerra contato
- "neutral": sem intenção comercial clara ou conversa meramente informativa
Regra: se o contato ainda não enviou mensagens, use "neutral" com confidence=50.
Responda APENAS com o JSON, sem markdown, sem texto adicional.`;

function buildUserPrompt(
  messages: { direction: string; content: string }[]
): string {
  const lines = messages
    .map((m) => `[${m.direction === "inbound" ? "contato" : "atendente"}] ${m.content}`)
    .join("\n");
  return `Últimas ${messages.length} mensagens da conversa:\n${lines}\n\nQual é a intenção principal do contato?`;
}

// ── Mock fallback ─────────────────────────────────────────────────────────────

const INTENT_PATTERNS: { intent: IntentType; pattern: RegExp }[] = [
  { intent: "complaint",       pattern: /problema|erro|não funciona|reclamação|insatisfeito|horrível|péssimo|decepcionado|absurdo/ },
  { intent: "urgency",         pattern: /urgente|urgência|rápido|hoje|agora|imediato|prazo|deadline|preciso urgente/ },
  { intent: "quote_request",   pattern: /orçamento|preço|valor|quanto custa|proposta|tabela de preços|investimento/ },
  { intent: "losing_interest", pattern: /não tenho interesse|desistir|cancelar|não vou|desistiu|esqueça|não preciso mais/ },
  { intent: "interest",        pattern: /quero|gostei|interesse|comprar|contratar|fechar|adorei|excelente|perfeito/ },
  { intent: "doubt",           pattern: /dúvida|como funciona|como usar|quando|onde|qual é|não entendi|pode explicar/ },
];

function mockDetectIntent(
  messages: { direction: string; content: string }[]
): { intent: IntentType; confidence: number; details: string } {
  const inboundText = messages
    .filter((m) => m.direction === "inbound")
    .map((m) => m.content.toLowerCase())
    .join(" ");
  const allText = messages.map((m) => m.content.toLowerCase()).join(" ");

  for (const { intent, pattern } of INTENT_PATTERNS) {
    if (pattern.test(inboundText) || pattern.test(allText)) {
      const confidence = pattern.test(inboundText) ? 85 : 65;
      return {
        intent,
        confidence,
        details: `[MOCK] Padrão detectado em ${pattern.test(inboundText) ? "mensagens do contato" : "conversa geral"}.`,
      };
    }
  }

  return { intent: "neutral", confidence: 50, details: "[MOCK] Nenhum padrão comercial detectado." };
}

// ── Task templates ────────────────────────────────────────────────────────────

const TASK_TEMPLATES: Partial<Record<IntentType, { title: string; priority: "high" | "medium" | "low" }>> = {
  complaint:       { title: "ALERTA: Reclamação detectada — atender imediatamente",   priority: "high"   },
  urgency:         { title: "Cliente com urgência — responder agora",                  priority: "high"   },
  quote_request:   { title: "Enviar proposta/orçamento",                               priority: "high"   },
  interest:        { title: "Follow-up: Lead quente na conversa",                      priority: "high"   },
  losing_interest: { title: "Risco de perda — reativar engajamento",                   priority: "medium" },
};
const TASK_INTENTS = new Set<IntentType>(["complaint", "urgency", "quote_request", "interest", "losing_interest"]);

// ── Main ──────────────────────────────────────────────────────────────────────

export async function detectIntent(
  input: DetectIntentInput
): Promise<DetectIntentResult> {
  const messages = await prisma.message.findMany({
    where:   { conversationId: input.conversationId, tenantId: input.tenantId },
    orderBy: { sentAt: "desc" },
    take:    10,
    select:  { content: true, direction: true },
  });

  // ── AI inference (real → mock fallback) ──────────────────────────────────────
  let intent:       IntentType;
  let confidence:   number;
  let details:      string;
  let outputTokens: number;
  let modelProvider = "mock";
  let modelId       = "mock-v2";

  const VALID_INTENTS: IntentType[] = [
    "interest", "doubt", "complaint", "quote_request",
    "urgency", "losing_interest", "neutral",
  ];

  try {
    const result = await aiComplete({
      system:    SYSTEM_PROMPT,
      user:      buildUserPrompt([...messages].reverse()),
      maxTokens: 200,
    });

    const parsed = parseAIJson<{
      intent:     string;
      confidence: number;
      details:    string;
    }>(result.text);

    if (!VALID_INTENTS.includes(parsed.intent as IntentType)) {
      throw new Error("unexpected-ai-shape");
    }

    intent        = parsed.intent as IntentType;
    confidence    = Math.min(100, Math.max(0, Math.round(Number(parsed.confidence))));
    details       = String(parsed.details).slice(0, 200);
    outputTokens  = result.outputTokens;
    modelProvider = result.provider;
    modelId       = result.modelId;
  } catch {
    const mock = mockDetectIntent(messages);
    intent       = mock.intent;
    confidence   = mock.confidence;
    details      = mock.details;
    outputTokens = 20;
  }

  // ── Auto-create task (idempotent) ────────────────────────────────────────────
  let taskId:      string | null = null;
  let taskCreated  = false;

  if (TASK_INTENTS.has(intent)) {
    const existing = await prisma.task.findFirst({
      where: {
        tenantId:    input.tenantId,
        source:      "ai",
        status:      "pending",
        description: { contains: input.conversationId },
      },
    });

    if (!existing) {
      const template = TASK_TEMPLATES[intent];
      if (template) {
        const dueAt = new Date();
        dueAt.setHours(
          dueAt.getHours() + (intent === "complaint" || intent === "urgency" ? 2 : 24)
        );
        const task = await prisma.task.create({
          data: {
            tenantId:    input.tenantId,
            contactId:   input.contactId ?? null,
            title:       template.title,
            description: `Intenção detectada na conversa ${input.conversationId}. Confiança: ${confidence}%.`,
            dueAt,
            status:      "pending",
            priority:    template.priority,
            source:      "ai",
          },
        });
        taskId      = task.id;
        taskCreated = true;
      }
    } else {
      taskId = existing.id;
    }
  }

  // ── Persist ──────────────────────────────────────────────────────────────────
  await prisma.$transaction([
    prisma.conversation.update({
      where: { id: input.conversationId },
      data:  { detectedIntent: intent },
    }),
    prisma.aiLog.create({
      data: {
        tenantId:         input.tenantId,
        userId:           input.userId ?? null,
        entityType:       "conversation",
        entityId:         input.conversationId,
        action:           "detect_intent",
        modelProvider,
        modelId,
        promptTokens:     messages.length * 12,
        completionTokens: outputTokens,
        inputSummary:  `messages=${messages.length}, inbound=${messages.filter((m) => m.direction === "inbound").length}`,
        outputSummary: `intent=${intent}, confidence=${confidence}%, taskCreated=${taskCreated}`,
      },
    }),
  ]);

  return { intent, confidence, details, taskId, taskCreated };
}

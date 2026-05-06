export interface AIOptions {
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

export interface AIProvider {
  complete(prompt: string, options?: AIOptions): Promise<string>;
}

export interface AILogEntry {
  tenantId: string;
  userId?: string;
  entityType?: string;
  entityId?: string;
  action: string;
  modelProvider: string;
  modelId: string;
  promptTokens?: number;
  completionTokens?: number;
  inputSummary?: string;
  outputSummary?: string;
}

function getProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER ?? "claude";

  switch (provider) {
    case "claude":
      // Dynamic import to avoid loading unused SDK
      return require("./providers/claude").claudeProvider;
    case "openai":
      return require("./providers/openai").openaiProvider;
    case "gemini":
      return require("./providers/gemini").geminiProvider;
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}

export function getAIProvider(): AIProvider {
  return getProvider();
}
